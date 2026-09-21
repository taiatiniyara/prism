import {
  bulkAdvanceEnteredToReviewed,
  bootstrapReviewKpiContextAndOptions,
} from "@/app/data-entry/review-kpi/service";
import { getCurrentUser } from "@/lib/user.service";

export async function POST() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    // Scoped to exactly what the caller is currently viewing — same cookie-persisted filter
    // context the page itself renders from.
    const { context } = await bootstrapReviewKpiContextAndOptions();

    if (context.reportPeriodId == null) {
      return Response.json(
        { message: "Select a report period before advancing entries." },
        { status: 400 },
      );
    }

    const result = await bulkAdvanceEnteredToReviewed(context, user);
    return Response.json(result);
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
      { message: "Unable to advance entries to Reviewed." },
      { status: 500 },
    );
  }
}
