import {
  assertReviewKpiReadAccess,
  listReviewKpiRows,
  sanitizeReviewKpiFilterContext,
} from "@/app/data-entry/review-kpi/service";
import { parseReviewKpiFilterContext } from "@/app/api/data-entry/review-kpi/_lib/validators";
import { getCurrentUser } from "@/lib/user.service";

export async function GET(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const requestedContext = parseReviewKpiFilterContext(searchParams);
    const context = sanitizeReviewKpiFilterContext(requestedContext);

    assertReviewKpiReadAccess(user);

    const rows = await listReviewKpiRows(context);
    return Response.json({ context, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("VALIDATION:")) {
      return Response.json(
        { message: message.replace("VALIDATION:", "") },
        { status: 400 },
      );
    }

    if (message.startsWith("FORBIDDEN:")) {
      return Response.json(
        { message: message.replace("FORBIDDEN:", "") },
        { status: 403 },
      );
    }

    return Response.json(
      { message: "Unable to list review KPI rows." },
      { status: 500 },
    );
  }
}
