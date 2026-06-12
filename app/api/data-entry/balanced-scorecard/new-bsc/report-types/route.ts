import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { getReportTypeOptions } from "@/app/data-entry/balanced-scorecard/new-bsc/service";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const options = await getReportTypeOptions(auth.user);
    return Response.json({ options });
  } catch (error) {
    return errorResponse(error, "Unable to load tracking frequencies.");
  }
}
