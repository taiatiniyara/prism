import {
  getRunById,
  listRunsForScope,
} from "@/app/data-entry/enter-data/services/aggregated-worker/outcome-store";
import type { AggregatedWorkerScope } from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";

export const listAggregatedRuns = (scope: Partial<AggregatedWorkerScope>) => {
  const runs = listRunsForScope(scope);

  return runs.map((run) => {
    const calculated = run.outcomes.filter(
      (outcome) => outcome.status === "calculated",
    ).length;
    const skipped = run.outcomes.filter(
      (outcome) => outcome.status === "skipped",
    ).length;

    return {
      runId: run.runId,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      status: run.status,
      calculated,
      skipped,
      scope: run.scope,
    };
  });
};

export const getAggregatedRunWithOutcomes = (runId: string) => {
  return getRunById(runId);
};
