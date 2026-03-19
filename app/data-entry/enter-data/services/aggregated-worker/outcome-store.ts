import type { AggregatedWorkerScope } from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";
import type { AggregatedTargetOutcome } from "@/app/data-entry/enter-data/services/aggregated-worker/outcome-builder";

export interface AggregatedWorkerRunRecord {
  runId: string;
  scope: AggregatedWorkerScope;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed";
  outcomes: AggregatedTargetOutcome[];
}

const runStore = new Map<string, AggregatedWorkerRunRecord>();

export const storeRunStart = (run: AggregatedWorkerRunRecord): void => {
  runStore.set(run.runId, run);
};

export const storeRunOutcomes = (
  runId: string,
  outcomes: AggregatedTargetOutcome[],
): void => {
  const current = runStore.get(runId);
  if (!current) {
    return;
  }

  runStore.set(runId, {
    ...current,
    status: "completed",
    completedAt: new Date().toISOString(),
    outcomes,
  });
};

export const listRunsForScope = (
  scope: Partial<AggregatedWorkerScope>,
): AggregatedWorkerRunRecord[] => {
  const values = [...runStore.values()];

  return values
    .filter((run) => {
      if (
        scope.reportPeriodId != null &&
        run.scope.reportPeriodId !== scope.reportPeriodId
      ) {
        return false;
      }

      if (
        scope.serviceAreaId !== undefined &&
        run.scope.serviceAreaId !== scope.serviceAreaId
      ) {
        return false;
      }

      if (
        scope.energyResourceId !== undefined &&
        run.scope.energyResourceId !== scope.energyResourceId
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
};

export const getRunById = (
  runId: string,
): AggregatedWorkerRunRecord | undefined => runStore.get(runId);
