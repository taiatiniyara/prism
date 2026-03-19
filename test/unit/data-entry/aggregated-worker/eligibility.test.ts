import { describe, expect, it } from "vitest";

import { isEligibleAggregatedTarget } from "@/app/data-entry/enter-data/services/aggregated-worker/target-selector";

describe("aggregated target eligibility", () => {
  it("accepts aggregated targets with non-empty formulas", () => {
    expect(
      isEligibleAggregatedTarget({
        aggregated: true,
        formula: "A + B",
      }),
    ).toBe(true);
  });

  it("rejects non-aggregated or empty-formula targets", () => {
    expect(
      isEligibleAggregatedTarget({ aggregated: false, formula: "A + B" }),
    ).toBe(false);
    expect(
      isEligibleAggregatedTarget({ aggregated: true, formula: "  " }),
    ).toBe(false);
  });
});
