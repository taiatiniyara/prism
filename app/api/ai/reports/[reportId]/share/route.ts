import { recordNarrativeReviewDecision } from "@/lib/ai/narrative-review.service";
import { getCurrentUser } from "@/lib/user.service";

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

interface ReviewBody {
  traceId: string;
  decision: "APPROVED" | "REJECTED";
  rationale?: string;
}

export async function POST(request: Request, context: RouteContext) {
  let user;

  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await context.params;

  try {
    const body = (await request.json()) as Partial<ReviewBody>;

    if (!body.traceId || !body.decision) {
      return Response.json(
        { message: "traceId and decision are required.", code: "VALIDATION" },
        { status: 400 },
      );
    }

    const reviewed = recordNarrativeReviewDecision({
      traceId: body.traceId,
      decision: body.decision,
      rationale: body.rationale,
      reviewerUserId: user.id,
      reviewerRole: user.role,
    });

    return Response.json(
      {
        traceId: reviewed.traceId,
        reportId,
        decision: reviewed.decision,
        reviewedAt: reviewed.reviewedAt,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    if (message.startsWith("FORBIDDEN:")) {
      return Response.json(
        {
          message: message.replace("FORBIDDEN:", "").trim(),
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    return Response.json(
      {
        message: "Unable to record review decision.",
        code: "DOWNSTREAM_FAILURE",
      },
      { status: 500 },
    );
  }
}
