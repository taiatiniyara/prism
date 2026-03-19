import type {
  AggregatedWorkerScope,
  SourceSnapshot,
} from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";
import { readSourceSnapshot } from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";

export interface WorkerSnapshot {
  capturedAt: string;
  scope: AggregatedWorkerScope;
  values: SourceSnapshot;
}

export const buildSourceSnapshot = async (
  scope: AggregatedWorkerScope,
  variableNames: string[],
): Promise<WorkerSnapshot> => {
  const values = await readSourceSnapshot(scope, variableNames);

  return {
    capturedAt: new Date().toISOString(),
    scope,
    values,
  };
};
