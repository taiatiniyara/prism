import { db } from "@/db/connection";
import { aiChatSession, aiChatTurn, aiToolCall } from "@/db/schema/ai";
import { getPromptVersion } from "@/lib/ai";
import { validateInput, filterOutput } from "@/lib/ai/guardrails";
import { recordError, recordToolCall, checkRateLimit, recordLatency } from "@/lib/ai/rate-limit";
import type { AiChatMessage } from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/user.service";
import { eq, sql, and } from "drizzle-orm";
import { getSystemPrompt } from "@/lib/ai/prompt";
import { checkUserUtility } from "@/lib/ai/data-service/utils";
import { runAiStream, runAiGenerate } from "@/lib/ai/service";
import { logger } from "@/lib/logger";

export const maxDuration = 120;

const ADMIN_ROLES = new Set(["BMO", "DEV"]);
const isAdminRole = (role: string | null | undefined): boolean =>
  role != null && ADMIN_ROLES.has(role.toUpperCase());

const isValidOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (appUrl) {
    const allowed = [appUrl];
    if (origin && allowed.some((a) => origin.startsWith(a))) return true;
    if (referer && allowed.some((a) => referer.startsWith(a))) return true;
  }
  return false;
};

const deriveSessionTitle = (message: string): string => {
  const normalized = message.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const capped = normalized.length > 40 ? normalized.slice(0, 37) + "..." : normalized;
  return capped || "New chat";
};

const summarizeConversation = async (
  sessionId: number,
  userId: string,
): Promise<void> => {
  try {
    const turns = await db
      .select({
        user_message: aiChatTurn.user_message,
        assistant_response: aiChatTurn.assistant_response,
      })
      .from(aiChatTurn)
      .where(eq(aiChatTurn.session_id, sessionId))
      .orderBy(sql`${aiChatTurn.turn_number} ASC`);

    if (turns.length < 8) return;

    const conversationText = turns
      .slice(0, -2)
      .map((t, i) => `[Turn ${i + 1}] User: ${t.user_message}\nAssistant: ${(t.assistant_response ?? "").slice(0, 300)}`)
      .join("\n\n");

    const { reply } = await runAiGenerate({
      messages: [
        {
          role: "user",
          content: `Summarise the following PRISM AI conversation into a concise JSON object with these keys:
- utility_ids (array of mentioned utility IDs or names)
- report_periods (array of mentioned period IDs or years)
- topics (array of 3-5 main topics discussed)
- key_findings (array of 1-3 important findings or conclusions)

Only use information explicitly present in the conversation. Return valid JSON only.

Conversation:
${conversationText}`,
        },
      ],
      user: { id: userId, role: null, org_id: null } as never,
      maxHistoryTurns: 1,
    });

    const jsonStart = reply.indexOf("{");
    const jsonEnd = reply.lastIndexOf("}") + 1;
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(reply.slice(jsonStart, jsonEnd));
      await db
        .update(aiChatSession)
        .set({ context_summary: parsed })
        .where(eq(aiChatSession.id, sessionId));
    }
  } catch (err) {
    logger.error("[ai-chat] Summarization failed", { error: err instanceof Error ? err.message : String(err), sessionId });
    recordError(userId).catch(() => {});
  }
};

const sanitizeClientMessages = (messages: AiChatMessage[]): AiChatMessage[] => {
  return messages.map((msg) => {
    if (msg.role === "user" || msg.role === "assistant") {
      return { role: msg.role, content: msg.content };
    }
    return {
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : "",
    };
  });
};

const validateContextSummary = (ctx: unknown): Record<string, unknown> | null => {
  if (!ctx || typeof ctx !== "object") return null;
  const obj = ctx as Record<string, unknown>;
  const isValidStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((item) => typeof item === "string" && item.length <= 200);
  const result: Record<string, unknown> = {};
  if (isValidStringArray(obj.topics)) result.topics = obj.topics.slice(0, 5);
  if (isValidStringArray(obj.key_findings)) result.key_findings = obj.key_findings.slice(0, 5);
  if (isValidStringArray(obj.utility_ids)) result.utility_ids = obj.utility_ids.slice(0, 10);
  if (Array.isArray(obj.report_periods) && obj.report_periods.every((p) => typeof p === "string" || typeof p === "number"))
    result.report_periods = obj.report_periods.slice(0, 5);
  return Object.keys(result).length > 0 ? result : null;
};

export async function POST(request: Request) {
  const startedAt = Date.now();

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    logger.warn("[ai-chat] Request rejected: invalid origin", { userId: user.id });
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
  }

  const rateLimitCheck = checkRateLimit(user.id);
  if (!rateLimitCheck.allowed) {
    const retryAfter = Math.ceil((rateLimitCheck.retryAfterMs ?? 60000) / 1000);
    logger.warn("[ai-chat] Rate limit hit", { userId: user.id, retryAfter });
    return Response.json(
      { message: `Rate limit reached. Please wait ${retryAfter} seconds before trying again.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
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

  const cleanMessages = sanitizeClientMessages(body.messages);

  for (const msg of cleanMessages) {
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

  const lastUserMessage = cleanMessages.filter((m) => m.role === "user").pop();
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

  // Declared outside try so accessible in catch for error recovery
  let sessionId = 0;
  let turnNumber = 0;
  let turnId = 0;
  let existingContextSummary: unknown = null;

  try {
    if (body.sessionId) {
      const [existingSession] = await db
        .select({ id: aiChatSession.id, context_summary: aiChatSession.context_summary })
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
      existingContextSummary = existingSession.context_summary;

      const [maxTurn] = await db
        .select({ max_turn: sql<number>`COALESCE(MAX(${aiChatTurn.turn_number}), 0)` })
        .from(aiChatTurn)
        .where(eq(aiChatTurn.session_id, sessionId));

      turnNumber = (maxTurn?.max_turn ?? 0) + 1;
    } else {
      const title = deriveSessionTitle(lastUserMessage.content);
      const userMessageContent = lastUserMessage.content as string;
      const results = await db.transaction(async (tx) => {
        const [createdSession] = await tx
          .insert(aiChatSession)
          .values({
            user_id: user.id,
            title,
          })
          .returning({ id: aiChatSession.id });

        turnNumber = 1;

        const [createdTurn] = await tx
          .insert(aiChatTurn)
          .values({
            session_id: createdSession.id,
            turn_number: turnNumber,
            user_message: userMessageContent,
            prompt_version: getPromptVersion(),
          })
          .returning({ id: aiChatTurn.id });

        return { sessionId: createdSession.id, turnId: createdTurn.id };
      });

      sessionId = results.sessionId;
      turnId = results.turnId;
    }

    if (!turnId) {
      const [createdTurn] = await db
        .insert(aiChatTurn)
        .values({
          session_id: sessionId,
          turn_number: turnNumber,
          user_message: lastUserMessage.content,
          prompt_version: getPromptVersion(),
        })
        .returning({ id: aiChatTurn.id });

      turnId = createdTurn.id;
    }

    await db
      .update(aiChatSession)
      .set({ last_turn_at: new Date() })
      .where(eq(aiChatSession.id, sessionId));

    const conversationTurns = cleanMessages.filter((m) => m.role === "user").length;
    const shouldSummarize = conversationTurns > 8;

    const utilityCheck = checkUserUtility(user);
    let contextBlock = "";

    const validatedContext = validateContextSummary(existingContextSummary);
    if (validatedContext) {
      const parts: string[] = [];
      if (Array.isArray(validatedContext.topics)) parts.push(`Previous topics: ${validatedContext.topics.join(", ")}`);
      if (Array.isArray(validatedContext.key_findings)) parts.push(`Previous findings: ${validatedContext.key_findings.join(", ")}`);
      if (parts.length) contextBlock = `\n\nConversation context from earlier turns: ${parts.join(". ")}`;
    }

    const roleContext = user.role
      ? `\n\nCurrent user role: ${user.role}. ${
          isAdminRole(user.role)
            ? "This user is a platform administrator. They can access all utilities, approve custom KPIs, and manage configuration. Be thorough and technical."
            : user.role === "BLO"
              ? "This user is a blended learning officer. They need actionable insights for their utility with clear next steps and educational context."
              : user.role === "CEO"
                ? "This user is a CEO/executive. Prioritise strategic insights, trends, and high-level summaries. Avoid operational minutiae."
                : user.role === "EXT"
                  ? "This user is an external stakeholder. They have limited data access. Focus on what's available and provide context about PRISM's structure."
                  : "This user manages data entry and review. Focus on actionable tasks, data quality, and what needs attention."
        }`
      : "";

    const systemPrompt = getSystemPrompt() +
      roleContext +
      contextBlock +
      (!utilityCheck.valid
        ? `\n\nIMPORTANT: ${utilityCheck.message}`
        : "") +
      (shouldSummarize
        ? `\n\nNOTE: This conversation has ${conversationTurns} turns. Before answering, briefly summarise the key context from earlier turns in 1-2 sentences, then answer the latest question concisely.`
        : "");

    const { stream, fullStream, model, wasFallback, promptVersion } = await runAiStream({
      messages: cleanMessages,
      user,
      systemPromptOverride: systemPrompt,
      onFinish: async ({ text, usage, toolCalls: toolCallsFromStream, model: usedModel, wasFallback: fallbackFlag }) => {
        const turnLatencyMs = Date.now() - startedAt;
        recordLatency("chat", turnLatencyMs);

        try {
          const { filtered } = filterOutput(text);
          const finalText = filtered.trim() || "I received your question but was unable to generate a response. This may be due to model output limits. Could you try rephrasing or asking a more specific question?";

          const [existingTurn] = await db
            .select({ assistant_response: aiChatTurn.assistant_response })
            .from(aiChatTurn)
            .where(eq(aiChatTurn.id, turnId))
            .limit(1);

          if (existingTurn?.assistant_response) {
            return;
          }

          await db
            .update(aiChatTurn)
            .set({
              assistant_response: finalText,
              model_used: usedModel,
              model_was_fallback: fallbackFlag,
              token_count_input: usage.inputTokens,
              token_count_output: usage.outputTokens,
              latency_ms: turnLatencyMs,
            })
            .where(eq(aiChatTurn.id, turnId));

          if (toolCallsFromStream && toolCallsFromStream.length > 0) {
            for (const toolCall of toolCallsFromStream) {
              await db.insert(aiToolCall).values({
                turn_id: turnId,
                tool_name: toolCall.toolName,
                tool_args: toolCall.input as Record<string, unknown>,
                status: "success",
              });
              try {
                await recordToolCall(user.id);
              } catch {
                // Non-critical
              }
            }
          }

          // Best-effort summarization
          if (shouldSummarize) {
            summarizeConversation(sessionId, user.id).catch(() => {});
          }
        } catch (err) {
          logger.error("[ai-chat] Failed to persist turn response", { error: err instanceof Error ? err.message : String(err), turnId, sessionId });
        }
      },
    });

    const encoder = new TextEncoder();

    let fullStreamReader: ReadableStreamDefaultReader<unknown> | null = null;
    try {
      fullStreamReader = fullStream.getReader();
    } catch {
      // fullStream not available, fall back to text-only
    }

    const combined = new ReadableStream({
      async start(controller) {
        const textReader = stream.getReader();

        let textDone = false;
        let toolDone = !fullStreamReader;

        const readText = async () => {
          try {
            while (true) {
              const { done, value } = await textReader.read();
              if (done) break;

              const text = typeof value === "string" ? value : new TextDecoder().decode(value);
              if (text.length > 0) {
                controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
              }
            }
          } catch {
            controller.enqueue(encoder.encode(`3:${JSON.stringify({ error: "text_stream_error" })}\n`));
          }
          textDone = true;
          if (toolDone) {
            try { controller.close(); } catch { /* already closed */ }
          }
        };

        const readTools = async () => {
          if (!fullStreamReader) return;
          try {
            while (true) {
              const { done, value } = await fullStreamReader.read();
              if (done) break;

              if (value && typeof value === "object") {
                const event = value as Record<string, unknown>;
                if ((event.type === "tool-call" || event.type === "tool-result") && event.toolName) {
                  const payload = JSON.stringify({
                    type: event.type,
                    toolName: event.toolName,
                  });
                  controller.enqueue(encoder.encode(`2:${payload}\n`));
                } else if (event.type === "reasoning-start") {
                  controller.enqueue(encoder.encode(`1:${JSON.stringify({ type: "reasoning-start", id: event.id })}\n`));
                } else if (event.type === "reasoning-delta" && typeof event.text === "string") {
                  controller.enqueue(encoder.encode(`1:${JSON.stringify({ type: "reasoning-delta", text: event.text })}\n`));
                } else if (event.type === "reasoning-end") {
                  controller.enqueue(encoder.encode(`1:${JSON.stringify({ type: "reasoning-end", id: event.id })}\n`));
                }
              }
            }
          } catch {
            controller.enqueue(encoder.encode(`3:${JSON.stringify({ error: "tool_stream_error" })}\n`));
          }
          toolDone = true;
          if (textDone) {
            try { controller.close(); } catch { /* already closed */ }
          }
        };

        readText();
        readTools();
      },
    });

    return new Response(combined, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Session-Id": String(sessionId),
        "X-Turn-Id": String(turnId),
        "X-Model": model,
        "X-Was-Fallback": String(wasFallback),
        "X-Prompt-Version": promptVersion,
        "X-Protocol-Version": "2",
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("[ai-chat] AI chat error", { error: errMsg, userId: user.id, sessionId, turnId });
    const turnLatencyMs = Date.now() - startedAt;

    try {
      if (turnId > 0) {
        await db
          .update(aiChatTurn)
          .set({
            error_message: errMsg.slice(0, 500),
            latency_ms: turnLatencyMs,
          })
          .where(eq(aiChatTurn.id, turnId));
      }
    } catch {
      // Non-critical
    }

    try {
      await recordError(user.id);
    } catch {
      // Non-critical
    }

    if (errMsg.startsWith("GUARDRAIL:")) {
      return Response.json({ message: errMsg.slice(10) }, { status: 400 });
    }

    return Response.json(
      { message: "An unexpected error occurred. Please try again." },
      { status: 500 },
    );
  }
}
