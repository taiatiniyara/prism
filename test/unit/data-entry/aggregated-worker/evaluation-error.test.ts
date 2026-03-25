import { describe, expect, it } from "vitest";

import { evaluateFormula } from "@/app/data-entry/enter-data/services/aggregated-worker/evaluator";

describe("evaluation error classification", () => {
  it("skips formula with runtime errors", () => {
    const result = evaluateFormula("A + (", { A: 10 });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("evaluation-error");
  });

  it("calculates finite values", () => {
    const result = evaluateFormula("A + B", { A: 10, B: 5 });

    expect(result.status).toBe("calculated");
    expect(result.value).toBe("15");
  });

  it("calculates values when variable names include spaces", () => {
    const result = evaluateFormula(
      "Operating Income + Other Income - Total Expenses",
      {
        "Operating Income": 100,
        "Other Income": 20,
        "Total Expenses": 60,
      },
    );

    expect(result.status).toBe("calculated");
    expect(result.value).toBe("60");
  });
});
