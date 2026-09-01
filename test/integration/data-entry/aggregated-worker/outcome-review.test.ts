import { describe, expect, it } from "vitest";

import {
  getAggregatedRunWithOutcomes,
  listAggregatedRuns,
} from "@/app/data-entry/enter-data/services/aggregated-worker/review-service";
import {
  storeRunOutcomes,
  storeRunStart,
} from "@/app/data-entry/enter-data/services/aggregated-worker/outcome-store";

describe("operations review outcome retrieval", () => {
  it("returns run and target outcomes for review", () => {
    const runId = "outcome-review-run";

    storeRunStart({
      runId,
      scope: { reportPeriodId: 8080 },
      startedAt: new Date().toISOString(),
      status: "running",
      outcomes: [],
    });

    storeRunOutcomes(runId, [
      { runId, inputDefId: 3, status: "skipped", reason: "unknown-variable" },
    ]);

    const summary = listAggregatedRuns({ reportPeriodId: 8080 })[0];
    const full = getAggregatedRunWithOutcomes(runId);

    expect(summary?.runId).toBe(runId);
    expect(full?.outcomes[0]?.reason).toBe("unknown-variable");
  });
});
