import { db } from "@/db/connection";
import { chatMessages, chatSessions } from "@/db/schema/chat-history";
import { evaluateChatbotInputGuardrails, filterChatbotOutput } from "@/lib/chatbot/guardrails";
import { logError } from "@/lib/error-log.service";
import { consumeChatbotRateLimit } from "@/lib/chatbot/rate-limit";
import { runChatbotQuery, runChatbotQueryStream } from "@/lib/chatbot/service";
import type {
  ChatMessageInput,
  ChatbotQueryInput,
  ChatbotStreamEvent,
} from "@/lib/chatbot/types";
import { getCurrentUser, type CurrentUser } from "@/lib/user.service";
import { and, eq } from "drizzle-orm";

const isValidRole = (value: string): value is ChatMessageInput["role"] => {
  return value === "user" || value === "assistant";
};

const parseBody = (value: unknown): ChatbotQueryInput => {
  if (!value || typeof value !== "object") {
    throw new Error("VALIDATION:Request body is required.");
  }

  const body = value as Partial<ChatbotQueryInput>;
  if (!Array.isArray(body.messages)) {
    throw new Error("VALIDATION:messages must be an array.");
  }

  if (body.messages.length === 0) {
    throw new Error("VALIDATION:messages must not be empty.");
  }

  let sessionId: number | null = null;
  if (body.sessionId != null) {
    if (
      typeof body.sessionId !== "number" ||
      !Number.isFinite(body.sessionId) ||
      body.sessionId <= 0 ||
      !Number.isInteger(body.sessionId)
    ) {
      throw new Error("VALIDATION:sessionId must be a positive integer.");
    }

    sessionId = body.sessionId;
  }

  const parsed = body.messages.map((message, index) => {
    if (!message || typeof message !== "object") {
      throw new Error(`VALIDATION:messages[${index}] is invalid.`);
    }

    const role = String((message as Partial<ChatMessageInput>).role ?? "");
    const content = String(
      (message as Partial<ChatMessageInput>).content ?? "",
    ).trim();

    if (!isValidRole(role)) {
      throw new Error(`VALIDATION:messages[${index}].role is invalid.`);
    }

    if (!content) {
      throw new Error(`VALIDATION:messages[${index}].content is required.`);
    }

    if (content.length > 4000) {
      throw new Error(`VALIDATION:messages[${index}] exceeds 4000 characters.`);
    }

    return { role, content };
  });

  return { messages: parsed, sessionId };
};

const deriveSessionTitle = (value: string): string => {
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 120);

  return normalized || "New chat";
};

const VISUALIZATION_TYPES = new Set([
  "table",
  "bar-chart",
  "line-chart",
  "leaderboard",
  "sankey",
  "heatmap",
  "radar",
  "scatter",
]);

const extractJsonCandidates = (reply: string): string[] => {
  const candidates: string[] = [];
  const fencedMatches = reply.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fencedMatches) {
    const block = (match[1] ?? "").trim();
    if (block.startsWith("{") && block.endsWith("}")) {
      candidates.push(block);
    }
  }

  const plainMatch = reply.match(/\{[\s\S]*\}/);
  if (plainMatch) {
    candidates.push(plainMatch[0]);
  }

  return candidates;
};

const hasValidVisualizationPayload = (reply: string): boolean => {
  const candidates = extractJsonCandidates(reply);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { type?: unknown } | null;
      const type = parsed?.type;

      if (typeof type === "string" && VISUALIZATION_TYPES.has(type)) {
        return true;
      }
    } catch {
      // Ignore malformed candidates.
    }
  }

  return false;
};

const hasLikelyBrokenVisualizationPayload = (reply: string): boolean => {
  const normalized = reply.toLowerCase();

  if (/\{\s*"type"\s*:\s*""\s*\}?\s*$/i.test(reply)) {
    return true;
  }

  return (
    normalized.includes('"type"') &&
    normalized.includes("{") &&
    !hasValidVisualizationPayload(reply)
  );
};

const buildVisualizationRepairPrompt = (
  recommendedView: string,
  previousReply: string,
): string => {
  return [
    "Re-issue your previous answer for the same user question.",
    "Keep the same scope and figures; do not invent new values.",
    "Preserve concise narrative sections.",
    `Append exactly one complete JSON code block with type=\"${recommendedView}\" if supported; otherwise choose the closest valid type from table, bar-chart, line-chart, leaderboard, sankey, heatmap, radar, scatter.`,
    "The JSON must be valid and parseable, and type must be non-empty.",
    "Do not output partial or truncated JSON.",
    "Previous reply to repair:",
    previousReply,
  ].join("\n");
};

export async function POST(request: Request) {
  let currentUser: CurrentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: ChatbotQueryInput;
  try {
    body = parseBody(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (message.startsWith("VALIDATION:")) {
      return Response.json(
        { message: message.replace("VALIDATION:", "") },
        { status: 400 },
      );
    }

    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  const latestUserMessage = [...body.messages]
    .reverse()
    .find((message) => message.role === "user");

  if (!latestUserMessage) {
    return Response.json(
      { message: "No user message was provided." },
      { status: 400 },
    );
  }

  const rateLimit = consumeChatbotRateLimit(currentUser.id);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        message:
          "You have sent too many chat requests. Please wait a moment and try again.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const guardrailHit = evaluateChatbotInputGuardrails(
    latestUserMessage.content,
  );
  if (guardrailHit) {
    return Response.json(
      { message: guardrailHit.reason, rule: guardrailHit.rule },
      { status: 400 },
    );
  }

  let resolvedSessionId: number;
  try {
    if (body.sessionId != null) {
      const [existingSession] = await db
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.id, body.sessionId),
            eq(chatSessions.user_id, currentUser.id),
          ),
        )
        .limit(1);

      if (!existingSession) {
        return Response.json(
          { message: "Session not found." },
          { status: 404 },
        );
      }

      resolvedSessionId = existingSession.id;
    } else {
      const now = new Date();
      const [createdSession] = await db
        .insert(chatSessions)
        .values({
          user_id: currentUser.id,
          title: deriveSessionTitle(latestUserMessage.content),
          last_message_at: now,
          updated_at: now,
        })
        .returning({ id: chatSessions.id });

      resolvedSessionId = createdSession.id;
    }

    await db.insert(chatMessages).values({
      session_id: resolvedSessionId,
      role: "user",
      content: latestUserMessage.content,
    });

    const now = new Date();
    await db
      .update(chatSessions)
      .set({
        last_message_at: now,
        updated_at: now,
      })
      .where(eq(chatSessions.id, resolvedSessionId));
  } catch {
    return Response.json(
      { message: "Unable to persist chat session data." },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  const sendEvent = (
    controller: ReadableStreamDefaultController,
    event: ChatbotStreamEvent,
  ) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  let streamResult: Awaited<ReturnType<typeof runChatbotQueryStream>> | null =
    null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        streamResult = await runChatbotQueryStream(body.messages, currentUser);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected error";

        if (message.startsWith("VALIDATION:")) {
          sendEvent(controller, {
            type: "error",
            message: message.replace("VALIDATION:", ""),
          });
        } else if (message.startsWith("TIMEOUT:")) {
          sendEvent(controller, {
            type: "error",
            message: message.replace("TIMEOUT:", ""),
          });
        } else {
          console.error("Chatbot stream error:", message);
          try {
            await logError({
              source: "chatbot",
              errorType: "stream_error",
              message: message.length > 500 ? message.slice(0, 497) + "..." : message,
              userId: currentUser.id,
              userEmail: currentUser.email,
              userRole: currentUser.role,
            });
          } catch {
            // Non-critical: don't break the response for failed logging
          }
          sendEvent(controller, {
            type: "error",
            message: "Unable to complete chatbot response.",
          });
        }

        controller.close();
        return;
      }

      sendEvent(controller, {
        type: "meta",
        model: streamResult.model,
        sessionId: resolvedSessionId,
        capabilitiesUsed: streamResult.capabilitiesUsed,
        recommendedView: streamResult.recommendedView,
      });

      let fullReply = "";

      const persistAssistantReply = async (
        reply: string,
        model: string,
        capabilitiesUsed: string[],
        recommendedView: string,
      ) => {
        try {
          await db.insert(chatMessages).values({
            session_id: resolvedSessionId,
            role: "assistant",
            content: reply,
            model,
            capabilities_used: capabilitiesUsed.length
              ? JSON.stringify(capabilitiesUsed)
              : null,
            recommended_view: recommendedView,
          });

          const now = new Date();
          await db
            .update(chatSessions)
            .set({
              last_message_at: now,
              updated_at: now,
            })
            .where(eq(chatSessions.id, resolvedSessionId));
        } catch {
          // Do not break chat streaming if persistence fails after generation.
        }
      };

      try {
        for await (const delta of streamResult.textStream) {
          fullReply += delta;
          sendEvent(controller, { type: "delta", delta });
        }

        const reply = fullReply.trim();
        if (!reply) {
          try {
            const fallback = await runChatbotQuery(body.messages, currentUser);
            const { filtered: fallbackFiltered } = filterChatbotOutput(fallback.reply);
            const fallbackReply = fallbackFiltered.trim();

            if (fallbackReply) {
              await persistAssistantReply(
                fallbackReply,
                fallback.model,
                fallback.capabilitiesUsed,
                fallback.recommendedView,
              );

              sendEvent(controller, { type: "done", reply: fallbackReply });
              return;
            }
          } catch {
            // Keep existing behavior below if fallback completion also fails.
          }

          sendEvent(controller, {
            type: "error",
            message: "No chatbot reply returned.",
          });
          return;
        }

        const requiresVisualizationPayload =
          streamResult.recommendedView != null &&
          streamResult.recommendedView !== "text";

        let finalizedReply = reply;

        if (
          requiresVisualizationPayload &&
          !hasValidVisualizationPayload(finalizedReply) &&
          hasLikelyBrokenVisualizationPayload(finalizedReply)
        ) {
          try {
            const repaired = await runChatbotQuery(
              [
                ...body.messages,
                { role: "assistant", content: finalizedReply },
                {
                  role: "user",
                  content: buildVisualizationRepairPrompt(
                    streamResult.recommendedView,
                    finalizedReply,
                  ),
                },
              ],
              currentUser,
            );

            if (
              repaired.reply.trim().length > 0 &&
              hasValidVisualizationPayload(repaired.reply)
            ) {
              finalizedReply = repaired.reply.trim();
            }
          } catch {
            // Keep the streamed reply if repair generation fails.
          }
        }

        const { filtered: filteredReply } = filterChatbotOutput(finalizedReply);

        await persistAssistantReply(
          filteredReply,
          streamResult.model,
          streamResult.capabilitiesUsed,
          streamResult.recommendedView,
        );
        sendEvent(controller, { type: "done", reply: filteredReply });
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "AbortError"
            ? "Chatbot request timed out."
            : "Unable to complete chatbot response.";

        sendEvent(controller, { type: "error", message });
      } finally {
        streamResult?.cleanup();
        controller.close();
      }
    },
    cancel() {
      streamResult?.cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
