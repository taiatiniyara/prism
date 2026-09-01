import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseSetNodeMapDisplayPayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/strategy-map.validators";
import { setNodeMapDisplay } from "@/app/data-entry/balanced-scorecard/new-bsc/strategy-map.service";

// Per-node map-display overrides: label, on/off, and drag-to-position (mapX/mapY).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    const payload = parseSetNodeMapDisplayPayload(await request.json());
    await setNodeMapDisplay(auth.user, id, payload);
    return Response.json({ message: "Map node updated." });
  } catch (error) {
    return errorResponse(error, "Unable to update map node.");
  }
}
