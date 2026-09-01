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
  inputDefIds: number[],
): Promise<WorkerSnapshot> => {
  const values = await readSourceSnapshot(scope, variableNames, inputDefIds);

  return {
    capturedAt: new Date().toISOString(),
    scope,
    values,
  };
};
