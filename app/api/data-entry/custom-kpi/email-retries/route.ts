import { processPendingCustomKpiOutcomeEmails } from "@/app/settings/kpi/custom-kpi/service";
import { assertCustomKpiReviewerAccess } from "@/app/data-entry/review-kpi/service";
import { getCurrentUser } from "@/lib/user.service";

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    assertCustomKpiReviewerAccess(user);

    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 25;

    const summary = await processPendingCustomKpiOutcomeEmails(
      Number.isFinite(limit) && limit > 0 ? limit : 25,
    );

    return Response.json(summary, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("FORBIDDEN:")) {
      return Response.json(
        { message: message.replace("FORBIDDEN:", "") },
        { status: 403 },
      );
    }

    if (message.startsWith("VALIDATION:")) {
      return Response.json(
        { message: message.replace("VALIDATION:", "") },
        { status: 400 },
      );
    }

    return Response.json(
      { message: "Unable to process custom KPI email retries." },
      { status: 500 },
    );
  }
}
