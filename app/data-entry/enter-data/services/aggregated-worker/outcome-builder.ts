import type { AggregatedSkipReason } from "@/app/data-entry/enter-data/services/aggregated-worker/dependency-classifier";

export interface AggregatedTargetOutcome {
  runId: string;
  inputDefId: number;
  status: "calculated" | "skipped";
  reason?: AggregatedSkipReason;
  calculatedValue?: string;
}

export const buildCalculatedOutcome = (
  runId: string,
  inputDefId: number,
  value: string,
): AggregatedTargetOutcome => ({
  runId,
  inputDefId,
  status: "calculated",
  calculatedValue: value,
});

export const buildSkippedOutcome = (
  runId: string,
  inputDefId: number,
  reason: AggregatedSkipReason,
): AggregatedTargetOutcome => ({
  runId,
  inputDefId,
  status: "skipped",
  reason,
});
