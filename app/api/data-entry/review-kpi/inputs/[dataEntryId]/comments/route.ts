import {
  parseAddCommentPayload,
  parseRequiredUuid,
} from "@/app/api/data-entry/review-kpi/_lib/validators";
import { addReviewKpiInputComment } from "@/app/data-entry/review-kpi/service";
import { getCurrentUser } from "@/lib/user.service";

export async function POST(
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
    const payload = parseAddCommentPayload(await request.json());

    const result = await addReviewKpiInputComment(
      safeDataEntryId,
      payload.comment,
      user,
    );

    return Response.json(result, { status: 201 });
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
      { message: "Unable to add comment." },
      { status: 500 },
    );
  }
}
