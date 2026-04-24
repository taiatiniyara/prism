import { db } from "@/db/connection";
import { chatMessages, chatSessions } from "@/db/schema/chat-history";
import { runChatbotQueryStream } from "@/lib/chatbot/service";
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

      try {
        for await (const delta of streamResult.textStream) {
          fullReply += delta;
          sendEvent(controller, { type: "delta", delta });
        }

        const reply = fullReply.trim();
        if (!reply) {
          sendEvent(controller, {
            type: "error",
            message: "No chatbot reply returned.",
          });
          return;
        }

        try {
          await db.insert(chatMessages).values({
            session_id: resolvedSessionId,
            role: "assistant",
            content: reply,
            model: streamResult.model,
            capabilities_used: streamResult.capabilitiesUsed.length
              ? JSON.stringify(streamResult.capabilitiesUsed)
              : null,
            recommended_view: streamResult.recommendedView,
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
        sendEvent(controller, { type: "done", reply });
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
