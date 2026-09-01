import { describe, expect, it } from "vitest";

import { listAggregatedRuns } from "@/app/data-entry/enter-data/services/aggregated-worker/review-service";
import {
  storeRunOutcomes,
  storeRunStart,
} from "@/app/data-entry/enter-data/services/aggregated-worker/outcome-store";

describe("run summary aggregation", () => {
  it("returns calculated and skipped counts", () => {
    const runId = "unit-run-summary";

    storeRunStart({
      runId,
      scope: { reportPeriodId: 999 },
      startedAt: new Date().toISOString(),
      status: "running",
      outcomes: [],
    });

    storeRunOutcomes(runId, [
      { runId, inputDefId: 1, status: "calculated", calculatedValue: "2" },
      { runId, inputDefId: 2, status: "skipped", reason: "missing-value" },
    ]);

    const [summary] = listAggregatedRuns({ reportPeriodId: 999 });

    expect(summary?.calculated).toBe(1);
    expect(summary?.skipped).toBe(1);
    expect(summary?.status).toBe("completed");
  });
});
