import { db } from "@/db/connection";
import { chatSessions } from "@/db/schema/chat-history";
import { getCurrentUser } from "@/lib/user.service";
import { desc, eq } from "drizzle-orm";

const parseTitle = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 120);
};

export async function GET() {
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.user_id, currentUser.id))
    .orderBy(desc(chatSessions.last_message_at), desc(chatSessions.updated_at))
    .limit(50);

  return Response.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.created_at.toISOString(),
      updatedAt: session.updated_at.toISOString(),
      lastMessageAt: session.last_message_at.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let title: string | null = null;
  try {
    const body = (await request.json()) as { title?: unknown };
    title = parseTitle(body?.title);
  } catch {
    title = null;
  }

  const now = new Date();
  const [created] = await db
    .insert(chatSessions)
    .values({
      user_id: currentUser.id,
      title: title ?? "New chat",
      last_message_at: now,
      updated_at: now,
    })
    .returning();

  return Response.json({
    session: {
      id: created.id,
      title: created.title,
      createdAt: created.created_at.toISOString(),
      updatedAt: created.updated_at.toISOString(),
      lastMessageAt: created.last_message_at.toISOString(),
    },
  });
}
