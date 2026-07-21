import { describe, expect, it } from "vitest";

import { extractFormulaVariables } from "@/app/data-entry/enter-data/services/aggregated-worker/variable-parser";

describe("formula variable resolution", () => {
  it("extracts unique variables from formula text", () => {
    expect(extractFormulaVariables("(A + B) / A")).toEqual(["A", "B"]);
  });

  it("prefers formula input metadata mapping when available", () => {
    expect(
      extractFormulaVariables("A + B", [
        { measure_def_id: 1, variable_name: "X" },
        { measure_def_id: 2, variable_name: "Y" },
      ]),
    ).toEqual(["X", "Y"]);
  });
});
