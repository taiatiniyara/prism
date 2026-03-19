import { getAggregatedRunWithOutcomes } from "@/app/data-entry/enter-data/services/aggregated-worker/review-service";
import { getCurrentUser } from "@/lib/user.service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  await getCurrentUser();

  const { runId } = await context.params;
  const run = getAggregatedRunWithOutcomes(runId);

  if (!run) {
    return new Response("Run not found", { status: 404 });
  }

  return Response.json(run);
}
