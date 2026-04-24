import { db } from "@/db/connection";
import { chatMessages, chatSessions } from "@/db/schema/chat-history";
import { getCurrentUser } from "@/lib/user.service";
import { and, asc, eq } from "drizzle-orm";

type RouteParams = {
  params: Promise<{
    sessionId: string;
  }>;
};

const parseSessionId = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("VALIDATION:Invalid session id.");
  }

  return parsed;
};

export async function GET(_request: Request, { params }: RouteParams) {
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { sessionId: sessionIdRaw } = await params;

  let sessionId: number;
  try {
    sessionId = parseSessionId(sessionIdRaw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid session id.";
    return Response.json(
      { message: message.replace("VALIDATION:", "") },
      { status: 400 },
    );
  }

  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.user_id, currentUser.id)))
    .limit(1);

  if (!session) {
    return Response.json({ message: "Session not found." }, { status: 404 });
  }

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.session_id, sessionId))
    .orderBy(asc(chatMessages.created_at), asc(chatMessages.id));

  return Response.json({
    session: {
      id: session.id,
      title: session.title,
      createdAt: session.created_at.toISOString(),
      updatedAt: session.updated_at.toISOString(),
      lastMessageAt: session.last_message_at.toISOString(),
    },
    messages: messages.map((message) => {
      let capabilitiesUsed: string[] | null = null;
      if (message.capabilities_used) {
        try {
          const parsed = JSON.parse(message.capabilities_used) as unknown;
          if (Array.isArray(parsed)) {
            capabilitiesUsed = parsed
              .filter((value): value is string => typeof value === "string")
              .slice(0, 20);
          }
        } catch {
          capabilitiesUsed = null;
        }
      }

      return {
        id: message.id,
        role: message.role,
        content: message.content,
        model: message.model,
        recommendedView: message.recommended_view,
        capabilitiesUsed,
        createdAt: message.created_at.toISOString(),
      };
    }),
  });
}
