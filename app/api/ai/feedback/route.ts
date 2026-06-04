import { db } from "@/db/connection";
import { aiChatTurn, aiFeedback, aiReviewQueue } from "@/db/schema/ai";
import { getCurrentUser } from "@/lib/user.service";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: {
    turn_id: number;
    sentiment: "positive" | "negative";
    correction_text?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  if (!body.turn_id || !body.sentiment) {
    return Response.json(
      { message: "turn_id and sentiment are required." },
      { status: 400 },
    );
  }

  if (!["positive", "negative"].includes(body.sentiment)) {
    return Response.json(
      { message: "sentiment must be 'positive' or 'negative'." },
      { status: 400 },
    );
  }

  const [turn] = await db
    .select()
    .from(aiChatTurn)
    .where(eq(aiChatTurn.id, body.turn_id))
    .limit(1);

  if (!turn) {
    return Response.json({ message: "Turn not found." }, { status: 404 });
  }

  const [feedback] = await db
    .insert(aiFeedback)
    .values({
      turn_id: body.turn_id,
      user_id: user.id,
      sentiment: body.sentiment,
      correction_text: body.correction_text?.slice(0, 2000) || null,
    })
    .returning();

  if (body.sentiment === "negative") {
    await db.insert(aiReviewQueue).values({
      turn_id: body.turn_id,
      flagged_reason: "Negative user feedback",
      flagged_by_feedback_id: feedback.id,
    });
  }

  return Response.json({ feedback });
}
