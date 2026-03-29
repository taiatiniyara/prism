import { describe, expect, it } from "vitest";
import { buildScorecardSnapshot } from "@/app/data-entry/balanced-scorecard/aggregator";

describe("scorecard aggregator weighted scoring", () => {
  it("computes perspective and overall score from valid rows", () => {
    const now = new Date();
    const snapshot = buildScorecardSnapshot([
      {
        kpiId: "k1",
        kpiDefinitionId: 1,
        perspectiveLevel: 1,
        perspectiveLabel: "Financial",
        perspectiveWeight: 1,
        kpiWeight: 1,
        actualValue: 100,
        targetValue: 100,
        status: "on_track",
        approvalStateId: 5,
        updatedAt: now,
        filterScopeKey: "p1",
      },
      {
        kpiId: "k2",
        kpiDefinitionId: 2,
        perspectiveLevel: 2,
        perspectiveLabel: "Customer",
        perspectiveWeight: 1,
        kpiWeight: 1,
        actualValue: 80,
        targetValue: 100,
        status: "at_risk",
        approvalStateId: 5,
        updatedAt: now,
        filterScopeKey: "p1",
      },
    ]);

    expect(snapshot.perspectiveScores).toHaveLength(2);
    expect(snapshot.overallScore).toBeCloseTo(90, 1);
  });
});
