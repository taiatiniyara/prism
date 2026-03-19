import { describe, expect, it } from "vitest";

import { listAggregatedRuns } from "@/app/data-entry/enter-data/services/aggregated-worker/review-service";
import {
  storeRunOutcomes,
  storeRunStart,
} from "@/app/data-entry/enter-data/services/aggregated-worker/outcome-store";

describe("concurrency last-write-wins behavior", () => {
  it("keeps both runs and latest one appears first", () => {
    const firstRunId = "concurrency-first";
    const secondRunId = "concurrency-second";
    const scope = { reportPeriodId: 4321 };

    storeRunStart({
      runId: firstRunId,
      scope,
      startedAt: "2026-03-19T10:00:00.000Z",
      status: "running",
      outcomes: [],
    });
    storeRunOutcomes(firstRunId, [
      {
        runId: firstRunId,
        inputDefId: 1,
        status: "calculated",
        calculatedValue: "1",
      },
    ]);

    storeRunStart({
      runId: secondRunId,
      scope,
      startedAt: "2026-03-19T10:00:02.000Z",
      status: "running",
      outcomes: [],
    });
    storeRunOutcomes(secondRunId, [
      {
        runId: secondRunId,
        inputDefId: 1,
        status: "calculated",
        calculatedValue: "2",
      },
    ]);

    const runs = listAggregatedRuns(scope);
    expect(runs[0]?.runId).toBe(secondRunId);
    expect(runs[1]?.runId).toBe(firstRunId);
  });
});
