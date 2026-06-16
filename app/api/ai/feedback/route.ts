import { db } from "@/db/connection";
import { aiChatSession, aiChatTurn, aiFeedback, aiReviewQueue } from "@/db/schema/ai";
import { getCurrentUser } from "@/lib/user.service";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

const isValidOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (!origin && !referer) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (appUrl) {
    const allowed = [appUrl];
    if (origin && allowed.some((a) => origin.startsWith(a))) return true;
    if (referer && allowed.some((a) => referer.startsWith(a))) return true;
  }
  return false;
};

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!isValidOrigin(request)) {
    logger.warn("[ai-feedback] Request rejected: invalid origin", { userId: user.id });
    return Response.json({ message: "Invalid request origin." }, { status: 403 });
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
    .select({ id: aiChatTurn.id, session_id: aiChatTurn.session_id })
    .from(aiChatTurn)
    .innerJoin(aiChatSession, eq(aiChatTurn.session_id, aiChatSession.id))
    .where(
      and(
        eq(aiChatTurn.id, body.turn_id),
        eq(aiChatSession.user_id, user.id),
      ),
    )
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
