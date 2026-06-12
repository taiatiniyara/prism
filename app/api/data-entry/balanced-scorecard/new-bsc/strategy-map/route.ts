import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { getStrategyMap } from "@/app/data-entry/balanced-scorecard/new-bsc/strategy-map.service";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const map = await getStrategyMap(auth.user);
    return Response.json(map);
  } catch (error) {
    return errorResponse(error, "Unable to load strategy map.");
  }
}
