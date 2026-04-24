import { db } from "@/db/connection";
import { chatSessions } from "@/db/schema/chat-history";
import { getCurrentUser } from "@/lib/user.service";
import { and, eq } from "drizzle-orm";

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

const parseTitle = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new Error("VALIDATION:title is required.");
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error("VALIDATION:title must not be empty.");
  }

  return normalized.slice(0, 120);
};

export async function PATCH(request: Request, { params }: RouteParams) {
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
    const message =
      error instanceof Error ? error.message : "Invalid session id.";
    return Response.json(
      { message: message.replace("VALIDATION:", "") },
      { status: 400 },
    );
  }

  let title: string;
  try {
    const body = (await request.json()) as { title?: unknown };
    title = parseTitle(body?.title);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid body.";
    if (message.startsWith("VALIDATION:")) {
      return Response.json(
        { message: message.replace("VALIDATION:", "") },
        { status: 400 },
      );
    }

    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  const [updated] = await db
    .update(chatSessions)
    .set({
      title,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.user_id, currentUser.id),
      ),
    )
    .returning();

  if (!updated) {
    return Response.json({ message: "Session not found." }, { status: 404 });
  }

  return Response.json({
    session: {
      id: updated.id,
      title: updated.title,
      createdAt: updated.created_at.toISOString(),
      updatedAt: updated.updated_at.toISOString(),
      lastMessageAt: updated.last_message_at.toISOString(),
    },
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
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
    const message =
      error instanceof Error ? error.message : "Invalid session id.";
    return Response.json(
      { message: message.replace("VALIDATION:", "") },
      { status: 400 },
    );
  }

  const [deleted] = await db
    .delete(chatSessions)
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.user_id, currentUser.id),
      ),
    )
    .returning({ id: chatSessions.id });

  if (!deleted) {
    return Response.json({ message: "Session not found." }, { status: 404 });
  }

  return Response.json({ success: true });
}
