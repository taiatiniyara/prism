import { db } from "@/db/connection";
import { aiChatSession } from "@/db/schema/ai";
import { getCurrentUser } from "@/lib/user.service";
import { desc, sql, eq, and } from "drizzle-orm";

export async function GET(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const adminAll = searchParams.get("admin_all") === "true";
  const isAdmin = user.role === "DEV" || user.role === "BMO";

  const sessions = adminAll && isAdmin
    ? await db
        .select()
        .from(aiChatSession)
        .where(sql`${aiChatSession.deleted_at} IS NULL`)
        .orderBy(desc(aiChatSession.last_turn_at))
        .limit(50)
    : await db
        .select()
        .from(aiChatSession)
        .where(
          and(
            eq(aiChatSession.user_id, user.id),
            sql`${aiChatSession.deleted_at} IS NULL`,
          ),
        )
        .orderBy(desc(aiChatSession.last_turn_at))
        .limit(50);

  return Response.json({ sessions });
}

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const title = body.title?.slice(0, 120) || "New chat";

  const [session] = await db
    .insert(aiChatSession)
    .values({
      user_id: user.id,
      title,
    })
    .returning();

  return Response.json({ session });
}
