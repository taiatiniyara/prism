import { runChatbotQueryStream } from "@/lib/chatbot/service";
import type {
  ChatMessageInput,
  ChatbotQueryInput,
  ChatbotStreamEvent,
} from "@/lib/chatbot/types";
import { getCurrentUser, type CurrentUser } from "@/lib/user.service";

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

  return { messages: parsed };
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

  let streamResult: Awaited<ReturnType<typeof runChatbotQueryStream>>;
  try {
    streamResult = await runChatbotQueryStream(body.messages, currentUser);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("VALIDATION:")) {
      return Response.json(
        { message: message.replace("VALIDATION:", "") },
        { status: 400 },
      );
    }

    if (message.startsWith("TIMEOUT:")) {
      return Response.json(
        { message: message.replace("TIMEOUT:", "") },
        { status: 504 },
      );
    }

    return Response.json(
      { message: "Unable to complete chatbot response." },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  const sendEvent = (controller: ReadableStreamDefaultController, event: ChatbotStreamEvent) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  const stream = new ReadableStream({
    async start(controller) {
      sendEvent(controller, {
        type: "meta",
        model: streamResult.model,
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

        sendEvent(controller, { type: "done", reply });
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "AbortError"
            ? "Chatbot request timed out."
            : "Unable to complete chatbot response.";

        sendEvent(controller, { type: "error", message });
      } finally {
        streamResult.cleanup();
        controller.close();
      }
    },
    cancel() {
      streamResult.cleanup();
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
