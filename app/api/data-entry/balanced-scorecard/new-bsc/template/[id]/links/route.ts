import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseSetTemplateNodeLinksPayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/validators";
import { editTemplateNodeLinks } from "@/app/data-entry/balanced-scorecard/new-bsc/service";

// Replace the master cause-effect links FROM this template node (BMO only).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    const { targetIds } = parseSetTemplateNodeLinksPayload(await request.json());
    await editTemplateNodeLinks(auth.user, id, targetIds);
    return Response.json({ message: "Master links updated." });
  } catch (error) {
    return errorResponse(error, "Unable to update master links.");
  }
}
