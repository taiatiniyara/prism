import { applyPendingUserDecision } from "@/app/settings/users/service";
import { parseStatusDecisionRequest } from "@/app/api/settings/users/_lib/validators";

type RouteParams = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const { userId } = await params;

  try {
    const json = await request.json();
    const payload = parseStatusDecisionRequest(json);

    const result = await applyPendingUserDecision({
      userId,
      decision: payload.decision,
      rejectionReason: payload.rejectionReason,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("VALIDATION:")) {
      return Response.json(
        { message: message.replace("VALIDATION:", "").trim() },
        { status: 400 },
      );
    }

    if (message.startsWith("FORBIDDEN:")) {
      return Response.json(
        { message: message.replace("FORBIDDEN:", "").trim() },
        { status: 403 },
      );
    }

    if (message.startsWith("NOT_FOUND:")) {
      return Response.json(
        { message: message.replace("NOT_FOUND:", "").trim() },
        { status: 404 },
      );
    }

    if (message.startsWith("INVALID_TRANSITION:")) {
      return Response.json(
        { message: message.replace("INVALID_TRANSITION:", "").trim() },
        { status: 409 },
      );
    }

    if (message === "Unauthorized") {
      return Response.json({ message: "Unauthorized" }, { status: 401 });
    }

    return Response.json(
      { message: "Unable to apply user status decision." },
      { status: 500 },
    );
  }
}
