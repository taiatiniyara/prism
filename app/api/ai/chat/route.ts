import { db } from "@/db/connection";
import { aiChatSession, aiChatTurn, aiToolCall } from "@/db/schema/ai";
import { getPromptVersion } from "@/lib/ai";
import { validateInput, filterOutput } from "@/lib/ai/guardrails";
import { checkRateLimit, recordRequest, recordError, recordToolCall, acquireConcurrencySlot, releaseConcurrencySlot } from "@/lib/ai/rate-limit";
import type { AiChatMessage } from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/user.service";
import { streamText, stepCountIs } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { createAiTools } from "@/lib/ai/tools";
import { getSystemPrompt } from "@/lib/ai/prompt";
import { anthropic } from "@ai-sdk/anthropic";
import { AI_MODELS, AI_RATE_LIMITS } from "@/lib/ai/types";

export const maxDuration = 60;

const deriveSessionTitle = (message: string): string => {
  const normalized = message.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const capped = normalized.length > 40 ? normalized.slice(0, 37) + "..." : normalized;
  return capped || "New chat";
};

export async function POST(request: Request) {
  const startedAt = Date.now();

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { messages: AiChatMessage[]; sessionId?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ message: "Messages are required." }, { status: 400 });
  }

  for (const msg of body.messages) {
    if (msg.role === "user" && typeof msg.content === "string") {
      const validation = validateInput(msg.content);
      if (!validation.passed) {
        return Response.json(
          { message: validation.reason, rule: validation.rule },
          { status: 400 },
        );
      }
    }
  }

  const lastUserMessage = body.messages.filter((m) => m.role === "user").pop();
  if (!lastUserMessage || typeof lastUserMessage.content !== "string") {
    return Response.json({ message: "No user message found." }, { status: 400 });
  }

  const inputValidation = validateInput(lastUserMessage.content);
  if (!inputValidation.passed) {
    return Response.json(
      { message: inputValidation.reason, rule: inputValidation.rule },
      { status: 400 },
    );
  }

  const rateLimitInfo = await checkRateLimit(user.id);
  if (!rateLimitInfo.allowed) {
    const reason =
      (rateLimitInfo.concurrent_count ?? 0) >= 5
        ? "Too many concurrent requests. Please wait for your other requests to complete."
        : "Rate limit exceeded. Please try again later.";
    return Response.json(
      { message: reason },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimitInfo.reset_at.getTime() - Date.now()) / 1000)),
          "X-RateLimit-Remaining": String(rateLimitInfo.remaining_requests),
        },
      },
    );
  }

  acquireConcurrencySlot(user.id);

  let sessionId: number;
  let turnNumber: number;

  const cleanup = () => releaseConcurrencySlot(user.id);

  try {
    if (body.sessionId) {
      const [existingSession] = await db
        .select({ id: aiChatSession.id })
        .from(aiChatSession)
        .where(
          and(
            eq(aiChatSession.id, body.sessionId),
            eq(aiChatSession.user_id, user.id),
            sql`${aiChatSession.deleted_at} IS NULL`,
          ),
        )
        .limit(1);

      if (!existingSession) {
        cleanup();
        return Response.json({ message: "Session not found." }, { status: 404 });
      }

      sessionId = existingSession.id;

      const [maxTurn] = await db
        .select({ max_turn: sql<number>`COALESCE(MAX(${aiChatTurn.turn_number}), 0)` })
        .from(aiChatTurn)
        .where(eq(aiChatTurn.session_id, sessionId));

      turnNumber = (maxTurn?.max_turn ?? 0) + 1;
    } else {
      const title = deriveSessionTitle(lastUserMessage.content);
      const [createdSession] = await db
        .insert(aiChatSession)
        .values({
          user_id: user.id,
          title,
        })
        .returning({ id: aiChatSession.id });

      sessionId = createdSession.id;
      turnNumber = 1;
    }

    const [createdTurn] = await db
      .insert(aiChatTurn)
      .values({
        session_id: sessionId,
        turn_number: turnNumber,
        user_message: lastUserMessage.content,
        prompt_version: getPromptVersion(),
      })
      .returning({ id: aiChatTurn.id });

    await db
      .update(aiChatSession)
      .set({ last_turn_at: new Date() })
      .where(eq(aiChatSession.id, sessionId));

    const modelName = rateLimitInfo.degraded_mode ? AI_MODELS.fallback : AI_MODELS.primary;
    const isThinkingModel = /^claude-sonnet-4/i.test(modelName);

    const preparedMessages = body.messages
      .slice(-AI_RATE_LIMITS.max_history_turns * 2)
      .map((msg: AiChatMessage) => ({
        role: msg.role,
        content: (msg.content as string).trim(),
      }))
      .filter((msg) => msg.content.length > 0);

    const tools = createAiTools(user);
    const systemPrompt = getSystemPrompt();

    const result = streamText({
      model: anthropic(modelName),
      system: systemPrompt,
      messages: preparedMessages,
      tools,
      maxOutputTokens: isThinkingModel ? 8000 : 2500,
      stopWhen: stepCountIs(10),
      ...(isThinkingModel
        ? { providerOptions: { anthropic: { thinking: { type: "enabled" as const, budgetTokens: 12000 } } } }
        : {}),
      onFinish: async ({ text, usage, toolCalls }) => {
        const turnLatencyMs = Date.now() - startedAt;

        try {
          const { filtered } = filterOutput(text);

          await db
            .update(aiChatTurn)
            .set({
              assistant_response: filtered,
              model_used: modelName,
              model_was_fallback: rateLimitInfo.degraded_mode,
              token_count_input: usage?.inputTokens ?? 0,
              token_count_output: usage?.outputTokens ?? 0,
              latency_ms: turnLatencyMs,
            })
            .where(eq(aiChatTurn.id, createdTurn.id));

          if (toolCalls && toolCalls.length > 0) {
            for (const toolCall of toolCalls) {
              await db.insert(aiToolCall).values({
                turn_id: createdTurn.id,
                tool_name: toolCall.toolName,
                tool_args: toolCall.input,
                status: "success",
              });
              try {
                await recordToolCall(user.id);
              } catch {
                // Non-critical
              }
            }
          }

          await recordRequest(
            user.id,
            (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
          );
        } catch {
          // Persistence failure shouldn't break the response
        } finally {
          cleanup();
        }
      },
    });

    return result.toTextStreamResponse({
      headers: {
        "X-Session-Id": String(sessionId),
        "X-Turn-Id": String(createdTurn.id),
        "X-Model": modelName,
      },
    });
  } catch (error) {
    console.error("AI chat error:", error instanceof Error ? error.message : String(error));
    cleanup();
    const turnLatencyMs = Date.now() - startedAt;

    try {
      await db
        .update(aiChatTurn)
        .set({
          error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
          latency_ms: turnLatencyMs,
        })
        .where(sql`${aiChatTurn.id} IS NOT NULL`);
    } catch {
      // Non-critical
    }

    try {
      await recordError(user.id);
    } catch {
      // Non-critical
    }
    return Response.json(
      { message: "An unexpected error occurred. Please try again." },
      { status: 500 },
    );
  }
}
