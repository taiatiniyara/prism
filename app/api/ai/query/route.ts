import { mapToSafeAiError } from "@/lib/ai/error-mapper";
import { canUseAiAssistant } from "@/lib/ai/access-policy";
import { runAiQuery } from "@/lib/ai/query.service";
import type { AiQueryInput, QueryClass } from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/user.service";

const QUERY_CLASSES: QueryClass[] = [
  "completeness",
  "review-bottlenecks",
  "stale-missing-kpi",
  "pending-queue",
];

const isQueryClass = (value: unknown): value is QueryClass => {
  return (
    typeof value === "string" && QUERY_CLASSES.includes(value as QueryClass)
  );
};

export async function POST(request: Request) {
  let currentUser;

  try {
    currentUser = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canUseAiAssistant(currentUser.role)) {
    return Response.json(
      {
        message: "You do not have access to AI reporting.",
        code: "FORBIDDEN",
      },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as Partial<AiQueryInput>;

    if (!body || typeof body.prompt !== "string") {
      throw new Error("VALIDATION:prompt is required.");
    }

    if (!isQueryClass(body.queryClass)) {
      throw new Error("VALIDATION:queryClass is invalid.");
    }

    const response = await runAiQuery({
      input: {
        prompt: body.prompt,
        queryClass: body.queryClass,
        filterContext: body.filterContext,
        sessionContextId: body.sessionContextId,
      },
      userId: currentUser.id,
      userRole: currentUser.role,
    });

    return Response.json(response, { status: 200 });
  } catch (error) {
    const safeError = mapToSafeAiError(error);
    const traceId = crypto.randomUUID();

    const statusByCode: Record<string, number> = {
      VALIDATION: 400,
      FORBIDDEN: 403,
      POLICY_BYPASS: 403,
      TIMEOUT: 504,
      NO_DATA: 404,
      DOWNSTREAM_FAILURE: 500,
    };

    return Response.json(
      {
        message: safeError.message,
        code: safeError.code,
        traceId,
      },
      { status: statusByCode[safeError.code] ?? 500 },
    );
  }
}
