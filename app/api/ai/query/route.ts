import { mapToSafeAiError } from "@/lib/ai/error-mapper";
import { canUseAiAssistant } from "@/lib/ai/access-policy";
import { runAiQuery } from "@/lib/ai/query.service";
import type { AiQueryInput, QueryClass, QueryMode } from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/user.service";

const QUERY_CLASSES: QueryClass[] = [
  "completeness",
  "review-bottlenecks",
  "stale-missing-kpi",
  "pending-queue",
  "aggregation-run-summary",
  "aggregation-run-details",
  "aggregation-failure-analysis",
  "generation-renewable-by-utility-year",
];

const QUERY_MODES: QueryMode[] = ["manual", "auto-scope"];

const isQueryClass = (value: unknown): value is QueryClass => {
  return (
    typeof value === "string" && QUERY_CLASSES.includes(value as QueryClass)
  );
};

const isQueryMode = (value: unknown): value is QueryMode => {
  return typeof value === "string" && QUERY_MODES.includes(value as QueryMode);
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

    if (body.mode != null && !isQueryMode(body.mode)) {
      throw new Error("VALIDATION:mode is invalid.");
    }

    const mode = body.mode ?? "auto-scope";

    if (body.queryClass != null && !isQueryClass(body.queryClass)) {
      throw new Error("VALIDATION:queryClass is invalid.");
    }

    const response = await runAiQuery({
      input: {
        prompt: body.prompt,
        queryClass: body.queryClass,
        mode,
        filterContext: body.filterContext,
        sessionContextId: body.sessionContextId,
      },
      userId: currentUser.id,
      userRole: currentUser.role,
      userOrgId: currentUser.org_id,
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
