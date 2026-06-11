import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseSetTrajectoryPayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/validators";
import { saveTrajectory } from "@/app/data-entry/balanced-scorecard/new-bsc/service";

export async function PUT(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const payload = parseSetTrajectoryPayload(await request.json());
    await saveTrajectory(auth.user, payload);
    return Response.json({ message: "Trajectory saved." });
  } catch (error) {
    return errorResponse(error, "Unable to save trajectory.");
  }
}
