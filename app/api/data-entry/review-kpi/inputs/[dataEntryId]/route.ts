import {
  parseRequiredUuid,
  parseUpdateInputPayload,
} from "@/app/api/data-entry/review-kpi/_lib/validators";
import { updateReviewKpiInputValue } from "@/app/data-entry/review-kpi/service";
import { getCurrentUser } from "@/lib/user.service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ dataEntryId: string }> },
) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { dataEntryId } = await params;
    const safeDataEntryId = parseRequiredUuid(dataEntryId, "dataEntryId");
    const payload = parseUpdateInputPayload(await request.json());

    const result = await updateReviewKpiInputValue(safeDataEntryId, payload, user);
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

    if (message.startsWith("CONFLICT:")) {
      const latest =
        typeof error === "object" && error !== null && "latest" in error
          ? (error as { latest?: unknown }).latest
          : null;

      return Response.json(
        {
          message: message.replace("CONFLICT:", ""),
          latest,
        },
        { status: 409 },
      );
    }

    return Response.json(
      { message: "Unable to update review KPI input." },
      { status: 500 },
    );
  }
}
