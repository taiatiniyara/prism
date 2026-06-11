import { db } from "@/db/connection";
import { aiChatTurn } from "@/db/schema/ai";
import { getCurrentUser } from "@/lib/user.service";
import { filterOutput } from "@/lib/ai/guardrails";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { turnId: number; content: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  if (!body.turnId || typeof body.content !== "string" || body.content.trim().length === 0) {
    return Response.json({ message: "turnId and content are required." }, { status: 400 });
  }

  const { filtered } = filterOutput(body.content);

  try {
    const [updated] = await db
      .update(aiChatTurn)
      .set({ assistant_response: filtered })
      .where(eq(aiChatTurn.id, body.turnId))
      .returning({ id: aiChatTurn.id, session_id: aiChatTurn.session_id });

    if (!updated) {
      return Response.json({ message: "Turn not found." }, { status: 404 });
    }

    return Response.json({ success: true, saved: filtered.length });
  } catch (err) {
    console.error("[ai-response] Failed to save response:", err instanceof Error ? err.message : String(err));
    return Response.json({ message: "Failed to save response." }, { status: 500 });
  }
}
