import { describe, expect, it } from "vitest";

import { isLikelyGenerationMetric } from "@/lib/ai/read-services";

describe("renewable generation prompt/data heuristics", () => {
  it("matches likely energy-output generation metrics", () => {
    expect(isLikelyGenerationMetric("Energy Generation", "MWh")).toBe(true);
    expect(isLikelyGenerationMetric("Electricity Generated", "GWh")).toBe(true);
    expect(isLikelyGenerationMetric("Net generation", "kWh")).toBe(true);
  });

  it("excludes cost or non-output generation labels", () => {
    expect(isLikelyGenerationMetric("O&M Costs: Generation", "USD")).toBe(
      false,
    );
    expect(
      isLikelyGenerationMetric(
        "Apportioned Cost: Duty and Taxes: Fuel & Oil",
        "USD",
      ),
    ).toBe(false);
    expect(isLikelyGenerationMetric("Customer Count", "count")).toBe(false);
  });
});
