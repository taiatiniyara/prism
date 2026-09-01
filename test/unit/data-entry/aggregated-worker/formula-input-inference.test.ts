import { describe, expect, it } from "vitest";

import { inferFormulaInputs } from "@/app/data-entry/enter-data/services/aggregated-worker/target-selector";

describe("formula input inference", () => {
  it("infers spaced variable names when formula_inputs metadata is missing", () => {
    const inferred = inferFormulaInputs("Total Income - Total Expenses", [
      { inputDefId: 11, variableName: "Total Income" },
      { inputDefId: 12, variableName: "Total Expenses" },
      { inputDefId: 13, variableName: "Income" },
    ]);

    expect(inferred).toEqual(
      expect.arrayContaining([
        { measure_def_id: 11, variable_name: "Total Income" },
        { measure_def_id: 12, variable_name: "Total Expenses" },
      ]),
    );
    expect(inferred).not.toEqual(
      expect.arrayContaining([{ measure_def_id: 13, variable_name: "Income" }]),
    );
  });

  it("infers identifier-style names with token boundaries", () => {
    const inferred = inferFormulaInputs("A + AB", [
      { inputDefId: 21, variableName: "A" },
      { inputDefId: 22, variableName: "AB" },
    ]);

    expect(inferred).toEqual(
      expect.arrayContaining([
        { measure_def_id: 21, variable_name: "A" },
        { measure_def_id: 22, variable_name: "AB" },
      ]),
    );
  });
});
