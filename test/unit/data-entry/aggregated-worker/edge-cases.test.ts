import { describe, expect, it } from "vitest";

import { evaluateFormula } from "@/app/data-entry/enter-data/services/aggregated-worker/evaluator";
import { extractFormulaVariables } from "@/app/data-entry/enter-data/services/aggregated-worker/variable-parser";

describe("aggregated worker edge cases", () => {
  it("handles formulas with no variables", () => {
    expect(extractFormulaVariables("10 + 2")).toEqual([]);
    const result = evaluateFormula("10 + 2", {});
    expect(result.status).toBe("calculated");
    expect(result.value).toBe("12");
  });

  it("deduplicates repeated variables", () => {
    expect(extractFormulaVariables("A + A + B")).toEqual(["A", "B"]);
  });

  it("skips non-finite calculation results", () => {
    const result = evaluateFormula("A / B", { A: 10, B: 0 });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("evaluation-error");
  });
});
