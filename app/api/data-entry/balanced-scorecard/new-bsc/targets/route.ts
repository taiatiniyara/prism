import {
  errorResponse,
  requireUser,
} from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/respond";
import { parseSaveKpiTargetsPayload } from "@/app/api/data-entry/balanced-scorecard/new-bsc/_lib/validators";
import {
  getKpiTargets,
  saveKpiTargetsForBsc,
} from "@/app/data-entry/balanced-scorecard/new-bsc/service";

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const kpiDefinitionId = Number(searchParams.get("kpiDefinitionId"));
    if (!Number.isInteger(kpiDefinitionId) || kpiDefinitionId <= 0) {
      throw new Error("VALIDATION:kpiDefinitionId must be a positive integer.");
    }
    const targets = await getKpiTargets(auth.user, kpiDefinitionId);
    return Response.json({ targets });
  } catch (error) {
    return errorResponse(error, "Unable to load KPI targets.");
  }
}

export async function PUT(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  try {
    const payload = parseSaveKpiTargetsPayload(await request.json());
    await saveKpiTargetsForBsc(auth.user, payload);
    return Response.json({ message: "Targets saved." });
  } catch (error) {
    return errorResponse(error, "Unable to save KPI targets.");
  }
}
