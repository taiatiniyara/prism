import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseUpdateObjectiveLinkPayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/strategy-map.validators";
import {
  editObjectiveLink,
  removeObjectiveLink,
} from "@/app/data-entry/balanced-scorecard/new-bsc/strategy-map.service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    const payload = parseUpdateObjectiveLinkPayload(await request.json());
    await editObjectiveLink(auth.user, id, payload);
    return Response.json({ message: "Link updated." });
  } catch (error) {
    return errorResponse(error, "Unable to update link.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    await removeObjectiveLink(auth.user, id);
    return Response.json({ message: "Link deleted." });
  } catch (error) {
    return errorResponse(error, "Unable to delete link.");
  }
}
