import { db } from "@/db/connection";
import { aiChatSession } from "@/db/schema/ai";
import { getCurrentUser } from "@/lib/user.service";
import { desc, sql } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sessions = await db
    .select()
    .from(aiChatSession)
    .where(
      sql`${aiChatSession.user_id} = ${user.id} AND ${aiChatSession.deleted_at} IS NULL`,
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
