import { listAggregatedRuns } from "@/app/data-entry/enter-data/services/aggregated-worker/review-service";
import { getCurrentUser } from "@/lib/user.service";

const parseOptionalNumber = (value: string | null): number | undefined => {
  if (value == null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export async function GET(request: Request) {
  await getCurrentUser();

  const { searchParams } = new URL(request.url);
  const reportPeriodId = parseOptionalNumber(
    searchParams.get("reportPeriodId"),
  );
  const serviceAreaId = parseOptionalNumber(searchParams.get("serviceAreaId"));
  const unitId = parseOptionalNumber(
    searchParams.get("unitId"),
  );

  const runs = listAggregatedRuns({
    reportPeriodId,
    serviceAreaId,
    unitId,
  });

  return Response.json(runs);
}
