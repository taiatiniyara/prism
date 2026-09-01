import { describe, expect, it } from "vitest";

import {
  formulaVariables,
  tokenizeFormula,
} from "@/components/formula-builder/formula-tokens";

describe("tokenizeFormula — display tokeniser", () => {
  it("splits on whitespace", () => {
    expect(tokenizeFormula("a + b * c")).toEqual(["a", "+", "b", "*", "c"]);
  });

  it("keeps a quoted segment as one token", () => {
    expect(tokenizeFormula('a + "Some Measure"')).toEqual([
      "a",
      "+",
      '"Some Measure"',
    ]);
  });

  it("is empty for whitespace-only input", () => {
    expect(tokenizeFormula("   ")).toEqual([]);
  });
});

describe("formulaVariables — delegates to analyzeFormula", () => {
  it("returns distinct identifiers in first-seen order", () => {
    expect(formulaVariables("b + a + b * (a - c)")).toEqual(["b", "a", "c"]);
  });

  it("excludes numeric literals", () => {
    expect(formulaVariables("a + 2.5 * 3")).toEqual(["a"]);
  });

  it("still surfaces identifiers from a malformed formula", () => {
    expect(formulaVariables("revenue @ costs")).toEqual(["revenue", "costs"]);
  });
});
