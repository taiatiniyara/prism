import { describe, expect, it } from "vitest";

import { resolveOverrideDecisionLineage } from "@/app/data-entry/review-kpi/service";

describe("override decision lineage", () => {
  it("allows initial pending decision without override", () => {
    const result = resolveOverrideDecisionLineage({
      currentStatus: "PENDING_REVIEW",
      overrideRequested: false,
      priorDecisionId: null,
    });

    expect(result).toEqual({
      requiresOverride: false,
      overrideDecisionId: null,
    });
  });

  it("requires prior decision id when overriding finalized decision", () => {
    expect(() =>
      resolveOverrideDecisionLineage({
        currentStatus: "REJECTED",
        overrideRequested: true,
        priorDecisionId: null,
      }),
    ).toThrow(/priorDecisionId is required/i);
  });

  it("returns lineage when override is properly supplied", () => {
    const result = resolveOverrideDecisionLineage({
      currentStatus: "APPROVED",
      overrideRequested: true,
      priorDecisionId: "decision-123",
    });

    expect(result).toEqual({
      requiresOverride: true,
      overrideDecisionId: "decision-123",
    });
  });
});
