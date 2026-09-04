import { describe, expect, it } from "vitest";

import { evaluateFormula } from "@/app/data-entry/enter-data/services/aggregated-worker/evaluator";
import { formulaVariableNames } from "@/app/data-entry/enter-data/services/aggregated-worker/formula-variables";

describe("aggregated worker edge cases", () => {
  it("handles formulas with no variables", () => {
    expect(formulaVariableNames("10 + 2")).toEqual([]);
    const result = evaluateFormula("10 + 2", {});
    expect(result.status).toBe("calculated");
    expect(result.value).toBe("12");
  });

  it("deduplicates repeated variables", () => {
    expect(formulaVariableNames("A + A + B")).toEqual(["A", "B"]);
  });

  it("prefers explicit binding names over parsing the formula", () => {
    expect(
      formulaVariableNames("x + y", [
        { measure_def_id: 1, variable_name: "Operating Expenses" },
        { measure_def_id: 2, variable_name: "Admin Expenses" },
      ]),
    ).toEqual(["Operating Expenses", "Admin Expenses"]);
  });

  it("skips non-finite calculation results", () => {
    const result = evaluateFormula("A / B", { A: 10, B: 0 });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("evaluation-error");
  });
});
