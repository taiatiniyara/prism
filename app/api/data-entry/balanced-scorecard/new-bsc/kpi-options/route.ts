import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { getKpiOptions } from "@/app/data-entry/balanced-scorecard/new-bsc/service";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const options = await getKpiOptions(auth.user);
    return Response.json({ options });
  } catch (error) {
    return errorResponse(error, "Unable to load KPI options.");
  }
}
