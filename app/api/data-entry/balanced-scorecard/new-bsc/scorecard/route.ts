import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseSavePerspectiveOverlayPayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/validators";
import {
  getScorecard,
  savePerspective,
} from "@/app/data-entry/balanced-scorecard/new-bsc/service";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const scorecard = await getScorecard(auth.user);
    return Response.json(scorecard);
  } catch (error) {
    return errorResponse(error, "Unable to load scorecard.");
  }
}

export async function PUT(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const payload = parseSavePerspectiveOverlayPayload(await request.json());
    await savePerspective(auth.user, payload);
    return Response.json({ message: "Scorecard saved." });
  } catch (error) {
    return errorResponse(error, "Unable to save scorecard.");
  }
}
