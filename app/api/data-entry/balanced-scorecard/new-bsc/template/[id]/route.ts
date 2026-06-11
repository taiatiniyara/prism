import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseUpdateTemplateNodePayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/validators";
import {
  editTemplateNode,
  removeTemplateNode,
} from "@/app/data-entry/balanced-scorecard/new-bsc/service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    const payload = parseUpdateTemplateNodePayload(await request.json());
    await editTemplateNode(auth.user, id, payload);
    return Response.json({ message: "Template node updated." });
  } catch (error) {
    return errorResponse(error, "Unable to update template node.");
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
    await removeTemplateNode(auth.user, id);
    return Response.json({ message: "Template node deleted." });
  } catch (error) {
    return errorResponse(error, "Unable to delete template node.");
  }
}
