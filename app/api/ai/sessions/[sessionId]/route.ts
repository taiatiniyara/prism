import { db } from "@/db/connection";
import { aiChatSession, aiChatTurn, aiToolCall } from "@/db/schema/ai";
import { getCurrentUser } from "@/lib/user.service";
import { and, asc, eq, sql } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const sessionIdNum = parseInt(sessionId, 10);

  if (isNaN(sessionIdNum)) {
    return Response.json({ message: "Invalid session ID." }, { status: 400 });
  }

  const [session] = await db
    .select()
    .from(aiChatSession)
    .where(
      and(
        eq(aiChatSession.id, sessionIdNum),
        eq(aiChatSession.user_id, user.id),
        sql`${aiChatSession.deleted_at} IS NULL`,
      ),
    )
    .limit(1);

  if (!session) {
    return Response.json({ message: "Session not found." }, { status: 404 });
  }

  const turns = await db
    .select()
    .from(aiChatTurn)
    .where(eq(aiChatTurn.session_id, sessionIdNum))
    .orderBy(asc(aiChatTurn.turn_number));

  const turnsWithToolCalls = await Promise.all(
    turns.map(async (turn) => {
      const toolCalls = await db
        .select()
        .from(aiToolCall)
        .where(eq(aiToolCall.turn_id, turn.id));

      return {
        ...turn,
        tool_calls: toolCalls,
      };
    }),
  );

  return Response.json({ session, turns: turnsWithToolCalls });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const sessionIdNum = parseInt(sessionId, 10);

  if (isNaN(sessionIdNum)) {
    return Response.json({ message: "Invalid session ID." }, { status: 400 });
  }

  const [session] = await db
    .select()
    .from(aiChatSession)
    .where(
      and(
        eq(aiChatSession.id, sessionIdNum),
        eq(aiChatSession.user_id, user.id),
      ),
    )
    .limit(1);

  if (!session) {
    return Response.json({ message: "Session not found." }, { status: 404 });
  }

  await db
    .update(aiChatSession)
    .set({ deleted_at: new Date() })
    .where(eq(aiChatSession.id, sessionIdNum));

  return Response.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const sessionIdNum = parseInt(sessionId, 10);

  if (isNaN(sessionIdNum)) {
    return Response.json({ message: "Invalid session ID." }, { status: 400 });
  }

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  const [session] = await db
    .select()
    .from(aiChatSession)
    .where(
      and(
        eq(aiChatSession.id, sessionIdNum),
        eq(aiChatSession.user_id, user.id),
        sql`${aiChatSession.deleted_at} IS NULL`,
      ),
    )
    .limit(1);

  if (!session) {
    return Response.json({ message: "Session not found." }, { status: 404 });
  }

  if (body.title) {
    await db
      .update(aiChatSession)
      .set({ title: body.title.slice(0, 120) })
      .where(eq(aiChatSession.id, sessionIdNum));
  }

  return Response.json({ success: true });
}
