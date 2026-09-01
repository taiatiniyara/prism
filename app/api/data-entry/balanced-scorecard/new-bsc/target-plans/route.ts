import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { getTargetPlans } from "@/app/data-entry/balanced-scorecard/new-bsc/service";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const plans = await getTargetPlans(auth.user);
    return Response.json({ plans });
  } catch (error) {
    return errorResponse(error, "Unable to load target plans.");
  }
}
