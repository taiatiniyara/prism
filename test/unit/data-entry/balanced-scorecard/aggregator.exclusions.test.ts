import { describe, expect, it } from "vitest";
import { buildScorecardSnapshot } from "@/app/data-entry/balanced-scorecard/aggregator";

describe("scorecard aggregator exclusions", () => {
  it("excludes rows with missing target or actual", () => {
    const now = new Date();
    const snapshot = buildScorecardSnapshot([
      {
        kpiId: "k-missing-target",
        kpiDefinitionId: 1,
        perspectiveLevel: 1,
        perspectiveLabel: "Financial",
        perspectiveWeight: 1,
        kpiWeight: 1,
        actualValue: 20,
        targetValue: null,
        status: "off_track",
        approvalStateId: 5,
        updatedAt: now,
        filterScopeKey: "p1",
      },
      {
        kpiId: "k-missing-actual",
        kpiDefinitionId: 2,
        perspectiveLevel: 1,
        perspectiveLabel: "Financial",
        perspectiveWeight: 1,
        kpiWeight: 1,
        actualValue: null,
        targetValue: 50,
        status: "off_track",
        approvalStateId: 5,
        updatedAt: now,
        filterScopeKey: "p1",
      },
    ]);

    expect(snapshot.excludedSummary.totalExcluded).toBeGreaterThanOrEqual(2);
    expect(
      Object.keys(snapshot.excludedSummary.byReason).length,
    ).toBeGreaterThan(0);
  });
});
