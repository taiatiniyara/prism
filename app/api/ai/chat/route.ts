import { db } from "@/db/connection";
import { aiChatSession, aiChatTurn, aiToolCall } from "@/db/schema/ai";
import { getPromptVersion } from "@/lib/ai";
import { validateInput } from "@/lib/ai/guardrails";
import { recordError, recordToolCall, checkRateLimit, checkCostBudget, recordLatency } from "@/lib/ai/rate-limit";
import type { AiChatMessage } from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/user.service";
import { eq, sql, and } from "drizzle-orm";
import { getSystemPrompt } from "@/lib/ai/prompt";
import { checkUserUtility } from "@/lib/ai/data-service/utils";
import { runAiStream, runAiGenerate, getCircuitState } from "@/lib/ai/service";
import { describeToolCall, NO_DATA_NARRATION } from "@/lib/ai/tool-narration";
import { isValidOrigin } from "@/lib/ai/origin";
import { logger } from "@/lib/logging/logger";

export const maxDuration = 120;

const ADMIN_ROLES = new Set(["BMO", "DEV"]);
const isAdminRole = (role: string | null | undefined): boolean =>
  role != null && ADMIN_ROLES.has(role.toUpperCase());

const getAudienceRegister = (role: string | null | undefined): string => {
  const upper = (role ?? "").toUpperCase();

  switch (upper) {
    case "CEO":
    case "EXE":
      return "CEO / Executive / Board";
    case "BMO":
    case "MGR":
      return "Manager / Operations";
    case "DEV":
    case "BLO":
    case "DAOF":
    case "DAOH":
    case "DAOO":
      return "Staff / Analyst";
    case "EXT":
      return "Consultant";
    default:
      return "Manager / Operations";
  }
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

// Unwraps SDK error causes (e.g. AI_InvalidPromptError -> AI_TypeValidationError) so the
// persisted error_message includes the actual offending value + zod issues, not just the
// generic outer message — needed to diagnose schema-validation failures after the fact.
const describeError = (err: unknown): string => {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  let cause = (err as { cause?: unknown }).cause;
  let depth = 0;
  while (cause instanceof Error && depth < 3) {
    parts.push(cause.message);
    cause = (cause as { cause?: unknown }).cause;
    depth++;
  }
  return parts.join(" | cause: ");
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

  const rateLimitCheck = await checkRateLimit(user.id);
  if (!rateLimitCheck.allowed) {
    const retryAfter = Math.ceil((rateLimitCheck.retryAfterMs ?? 60000) / 1000);
    logger.warn("[ai-chat] Rate limit hit", { userId: user.id, retryAfter });
    return Response.json(
      { message: `Rate limit reached. Please wait ${retryAfter} seconds before trying again.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const costBudgetCheck = await checkCostBudget(user.id);
  if (!costBudgetCheck.allowed) {
    logger.warn("[ai-chat] Cost budget exceeded", { userId: user.id, spentCents: costBudgetCheck.spentCents, limitCents: costBudgetCheck.limitCents });
    return Response.json(
      { message: `Daily AI budget reached ($${(costBudgetCheck.spentCents / 100).toFixed(2)} of $${(costBudgetCheck.limitCents / 100).toFixed(2)}). Your limit resets at midnight UTC.` },
      { status: 429 },
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

      // Lock the session row before computing MAX(turn_number)+1 so concurrent
      // requests for the same session (e.g. a double-submit) serialize on this row
      // lock instead of racing on the SELECT — row locks work across pooled
      // connections, unlike a session-level advisory lock.
      const userMessageContent = lastUserMessage.content as string;
      const results = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM ai_chat_session WHERE id = ${sessionId} FOR UPDATE`);

        const [maxTurn] = await tx
          .select({ max_turn: sql<number>`COALESCE(MAX(${aiChatTurn.turn_number}), 0)` })
          .from(aiChatTurn)
          .where(eq(aiChatTurn.session_id, sessionId));

        const nextTurnNumber = (maxTurn?.max_turn ?? 0) + 1;

        const [createdTurn] = await tx
          .insert(aiChatTurn)
          .values({
            session_id: sessionId,
            turn_number: nextTurnNumber,
            user_message: userMessageContent,
            prompt_version: getPromptVersion(),
          })
          .returning({ id: aiChatTurn.id });

        return { turnNumber: nextTurnNumber, turnId: createdTurn.id };
      });

      turnNumber = results.turnNumber;
      turnId = results.turnId;
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
      ? `\n\nCurrent audience register: ${getAudienceRegister(user.role)}.${
          isAdminRole(user.role)
            ? " This user is a platform administrator (BMO/DEV) — they can access all utilities' approved Financial Year data, approve custom KPIs, and manage configuration. Cross-utility benchmarking across all utilities is fully available to them."
            : user.role === "EXT"
              ? " This user is an external stakeholder. Their data access may be limited — do not claim other utilities' data is missing when it simply may not be visible to this user."
              : " This user is not a platform administrator. Their data access is scoped to their own utility (their approved Financial Year and monthly reporting). Other utilities' data DOES exist in the platform but is outside their access — do not say it is absent, say it is not visible in their scope."
        }`
      : "";

    const systemPrompt = (await getSystemPrompt()) +
      roleContext +
      contextBlock +
      (!utilityCheck.valid
        ? `\n\nIMPORTANT: ${utilityCheck.message}`
        : "") +
      (shouldSummarize
        ? `\n\nNOTE: This conversation has ${conversationTurns} turns. Before answering, briefly summarise the key context from earlier turns in 1-2 sentences, then answer the latest question concisely.`
        : "");

    const { fullStream, model, wasFallback, promptVersion } = await runAiStream({
      messages: cleanMessages,
      user,
      systemPromptOverride: systemPrompt,
    });

    const encoder = new TextEncoder();

    const combined = new ReadableStream({
      async start(controller) {
        const enqueue = (line: string) => {
          try {
            controller.enqueue(encoder.encode(line));
          } catch {
            // already closed
          }
        };
        const GENERIC_STREAM_ERROR = "Sorry, I encountered an error. Please try again.";
        const streamError = (rawMessage: string) => {
          logger.error("[ai-chat] Stream error", { error: rawMessage, turnId, sessionId });
          recordError(user.id).catch(() => {});
          enqueue(`3:${JSON.stringify({ error: GENERIC_STREAM_ERROR })}\n`);
        };

        let accumulatedText = "";
        const toolCalls: Array<{ toolName: string; input: unknown }> = [];
        let tokenUsage = { input: 0, output: 0 };
        let errorMessage: string | null = null;

        try {
          for await (const part of fullStream) {
            switch (part.type) {
              case "text-delta":
                accumulatedText += part.text;
                enqueue(`0:${JSON.stringify(part.text)}\n`);
                break;
              case "tool-call": {
                toolCalls.push({ toolName: part.toolName, input: part.input });
                const label = describeToolCall(part.toolName);
                enqueue(`2:${JSON.stringify({ type: "tool-start", toolName: part.toolName, label, timestamp: Date.now() })}\n`);
                enqueue(`1:${JSON.stringify({ type: "reasoning-delta", text: `${label}...\n` })}\n`);
                break;
              }
              case "tool-result":
                enqueue(`2:${JSON.stringify({ type: "tool-end", toolName: part.toolName, timestamp: Date.now(), resultSummary: "" })}\n`);
                break;
              case "tool-error":
                enqueue(`2:${JSON.stringify({ type: "tool-end", toolName: part.toolName, timestamp: Date.now(), resultSummary: "" })}\n`);
                enqueue(`1:${JSON.stringify({ type: "reasoning-delta", text: `${NO_DATA_NARRATION}...\n` })}\n`);
                break;
              case "finish":
                tokenUsage = {
                  input: part.totalUsage.inputTokens ?? 0,
                  output: part.totalUsage.outputTokens ?? 0,
                };
                break;
              case "error":
                errorMessage = describeError(part.error);
                streamError(errorMessage);
                break;
              default:
                break;
            }
          }
        } catch (err) {
          errorMessage = describeError(err);
          streamError(errorMessage);
        }

        // Known Anthropic edge case: a tool-using turn can finish with no text.
        // Reuse the tested retry+nudge logic in runAiGenerate rather than
        // restarting the stream (nothing has been sent on channel 0 yet, so
        // this swap-in is invisible to the client).
        if (!accumulatedText.trim() && toolCalls.length > 0 && !errorMessage) {
          try {
            const fallback = await runAiGenerate({ messages: cleanMessages, user, systemPromptOverride: systemPrompt });
            accumulatedText = fallback.reply;
            tokenUsage = fallback.tokenUsage;
            if (accumulatedText) enqueue(`0:${JSON.stringify(accumulatedText)}\n`);
          } catch (err) {
            logger.error("[ai-chat] Empty-answer fallback failed", { error: err instanceof Error ? err.message : String(err), turnId });
          }
        }

        try {
          controller.close();
        } catch {
          // already closed
        }

        const turnLatencyMs = Date.now() - startedAt;
        recordLatency("chat", turnLatencyMs);

        try {
          const finalText = accumulatedText.trim() || "I received your question but was unable to generate a response. This may be due to model output limits. Could you try rephrasing or asking a more specific question?";

          const [existingTurn] = await db
            .select({ assistant_response: aiChatTurn.assistant_response })
            .from(aiChatTurn)
            .where(eq(aiChatTurn.id, turnId))
            .limit(1);

          if (!existingTurn?.assistant_response) {
            await db
              .update(aiChatTurn)
              .set({
                assistant_response: finalText,
                model_used: model,
                model_was_fallback: wasFallback,
                token_count_input: tokenUsage.input,
                token_count_output: tokenUsage.output,
                latency_ms: turnLatencyMs,
                ...(errorMessage ? { error_message: errorMessage.slice(0, 4000) } : {}),
              })
              .where(eq(aiChatTurn.id, turnId));

            const seenTools = new Set<string>();
            for (const tc of toolCalls) {
              if (seenTools.has(tc.toolName)) continue;
              seenTools.add(tc.toolName);
              try {
                await db.insert(aiToolCall).values({
                  turn_id: turnId,
                  tool_name: tc.toolName,
                  tool_args: (tc.input as Record<string, unknown>) ?? {},
                  status: "success",
                });
              } catch {
                // Non-critical
              }
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

    const circuitState = getCircuitState(model);
    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Session-Id": String(sessionId),
      "X-Turn-Id": String(turnId),
      "X-Model": model,
      "X-Was-Fallback": String(wasFallback),
      "X-Prompt-Version": promptVersion,
    };
    if (circuitState.open) {
      headers["X-Circuit-Breaker"] = `open:${circuitState.remaining}s`;
    }

    return new Response(combined, { headers });

  } catch (error) {
    const errMsg = describeError(error);
    logger.error("[ai-chat] AI chat error", { error: errMsg, userId: user.id, sessionId, turnId });
    const turnLatencyMs = Date.now() - startedAt;

    try {
      if (turnId > 0) {
        await db
          .update(aiChatTurn)
          .set({
            error_message: errMsg.slice(0, 4000),
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
