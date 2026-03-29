import { describe, expect, it } from "vitest";
import { buildScorecardSnapshot } from "@/app/data-entry/balanced-scorecard/aggregator";

describe("scorecard aggregator dedupe", () => {
  it("keeps latest approved duplicate row", () => {
    const older = new Date("2026-01-01T00:00:00.000Z");
    const newer = new Date("2026-02-01T00:00:00.000Z");
    const snapshot = buildScorecardSnapshot([
      {
        kpiId: "k1-old",
        kpiDefinitionId: 10,
        perspectiveLevel: 1,
        perspectiveLabel: "Financial",
        perspectiveWeight: 1,
        kpiWeight: 1,
        actualValue: 90,
        targetValue: 100,
        status: "at_risk",
        approvalStateId: 5,
        updatedAt: older,
        filterScopeKey: "same",
      },
      {
        kpiId: "k1-new",
        kpiDefinitionId: 10,
        perspectiveLevel: 1,
        perspectiveLabel: "Financial",
        perspectiveWeight: 1,
        kpiWeight: 1,
        actualValue: 100,
        targetValue: 100,
        status: "on_track",
        approvalStateId: 5,
        updatedAt: newer,
        filterScopeKey: "same",
      },
    ]);

    expect(snapshot.perspectiveScores[0]?.includedCount).toBe(1);
    expect(snapshot.excludedSummary.totalExcluded).toBe(1);
  });
});
