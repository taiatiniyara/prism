import { db } from "@/db/connection";
import { aiChatSession, aiChatTurn, aiToolCall } from "@/db/schema/ai";
import { getPromptVersion } from "@/lib/ai";
import { validateInput } from "@/lib/ai/guardrails";
import { checkRateLimit, recordRequest } from "@/lib/ai/rate-limit";
import type { AiChatMessage } from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/user.service";
import { streamText, stepCountIs } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { createAiTools } from "@/lib/ai/tools";
import { getSystemPrompt } from "@/lib/ai/prompt";
import { openai } from "@ai-sdk/openai";
import { AI_MODELS, AI_RATE_LIMITS } from "@/lib/ai/types";

export const maxDuration = 60;

export async function POST(request: Request) {
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
    return Response.json(
      { message: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimitInfo.reset_at.getTime() - Date.now()) / 1000)),
          "X-RateLimit-Remaining": String(rateLimitInfo.remaining_requests),
        },
      },
    );
  }

  let sessionId: number;
  let turnNumber: number;

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
        return Response.json({ message: "Session not found." }, { status: 404 });
      }

      sessionId = existingSession.id;

      const [maxTurn] = await db
        .select({ max_turn: sql<number>`COALESCE(MAX(${aiChatTurn.turn_number}), 0)` })
        .from(aiChatTurn)
        .where(eq(aiChatTurn.session_id, sessionId));

      turnNumber = (maxTurn?.max_turn ?? 0) + 1;
    } else {
      const title = lastUserMessage.content.slice(0, 120) || "New chat";
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
    const isReasoningModel = /^(gpt-5|o1|o3|o4)/i.test(modelName);

    const preparedMessages = body.messages
      .slice(-AI_RATE_LIMITS.max_history_turns * 2)
      .map((msg: AiChatMessage) => ({
        role: msg.role,
        content: msg.content as string,
      }));

    const tools = createAiTools(user);
    const systemPrompt = getSystemPrompt();

    const result = streamText({
      model: openai(modelName),
      system: systemPrompt,
      messages: preparedMessages,
      tools,
      maxOutputTokens: isReasoningModel ? 8000 : 2500,
      stopWhen: stepCountIs(10),
      ...(isReasoningModel
        ? { providerOptions: { openai: { reasoningEffort: "low" as const } } }
        : {}),
      onFinish: async ({ text, usage, toolCalls }) => {
        try {
          await db
            .update(aiChatTurn)
            .set({
              assistant_response: text,
              model_used: modelName,
              model_was_fallback: rateLimitInfo.degraded_mode,
              token_count_input: usage?.inputTokens ?? 0,
              token_count_output: usage?.outputTokens ?? 0,
              latency_ms: 0,
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
            }
          }

          await recordRequest(
            user.id,
            (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
          );
        } catch {
          // Persistence failure shouldn't break the response
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
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ message }, { status: 500 });
  }
}
