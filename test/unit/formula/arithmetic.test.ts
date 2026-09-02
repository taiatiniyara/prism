import { describe, expect, it } from "vitest";

import {
  analyzeFormula,
  evaluateArithmetic,
  evaluateArithmeticWithAliases,
  FormulaError,
  MAX_EXPRESSION_DEPTH,
  MAX_FORMULA_LENGTH,
} from "@/lib/formula/arithmetic";

describe("evaluateArithmetic — correctness", () => {
  it("adds variables", () => {
    expect(evaluateArithmetic("a + b + c", { a: 1, b: 2, c: 3 })).toBe(6);
  });

  it("honours operator precedence", () => {
    expect(evaluateArithmetic("a + b * c", { a: 2, b: 3, c: 4 })).toBe(14);
  });

  it("honours parentheses", () => {
    expect(evaluateArithmetic("(a + b) * c", { a: 2, b: 3, c: 4 })).toBe(20);
  });

  it("applies unary minus", () => {
    expect(evaluateArithmetic("-a + b", { a: 5, b: 2 })).toBe(-3);
  });

  it("divides", () => {
    expect(evaluateArithmetic("a / b", { a: 7, b: 2 })).toBe(3.5);
  });

  it("evaluates numeric literals incl. decimals", () => {
    expect(evaluateArithmetic("1.5 * a", { a: 4 })).toBe(6);
  });

  it("computes the real Total Costs formula (sum of 8)", () => {
    const vars = {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
      g: 7,
      h: 8,
    };
    expect(
      evaluateArithmetic("a + b + c + d + e + f + g + h", vars),
    ).toBe(36);
  });
});

describe("evaluateArithmetic — fail-closed (never coerce / eval)", () => {
  const cases: Array<[string, Record<string, number>]> = [
    ["a && b", { a: 1, b: 2 }],
    ["a || b", { a: 1, b: 2 }],
    ["a > b", { a: 1, b: 2 }],
    ["a == b", { a: 1, b: 2 }],
    ["a ? b : c", { a: 1, b: 2, c: 3 }],
    ["a; b", { a: 1, b: 2 }],
    ["a.constructor", { a: 1 }],
    ["a[b]", { a: 1, b: 2 }],
    ["a**b", { a: 2, b: 3 }],
    ["process", {}],
    ["a +", { a: 1 }],
    ["+ a b", { a: 1, b: 2 }],
    ["(a + b", { a: 1, b: 2 }],
    ["a + b)", { a: 1, b: 2 }],
    ["", {}],
    ["   ", {}],
  ];
  it.each(cases)("throws FormulaError on %j", (formula, vars) => {
    expect(() => evaluateArithmetic(formula, vars)).toThrow(FormulaError);
  });

  it("throws when a referenced variable has no value", () => {
    expect(() => evaluateArithmetic("a + missing", { a: 1 })).toThrow(
      FormulaError,
    );
  });

  it("rejects inherited object members used as bare identifiers", () => {
    // constructor/toString/valueOf/__proto__ exist on {} via the prototype
    // chain but are not OWN properties, so they must not resolve as variables.
    for (const name of ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"]) {
      expect(() => evaluateArithmetic(name, {})).toThrow(FormulaError);
    }
  });

  it("throws (not NaN) on a non-finite result (division by zero)", () => {
    expect(() => evaluateArithmetic("a / b", { a: 1, b: 0 })).toThrow(
      FormulaError,
    );
  });
});

describe("evaluateArithmetic — DoS bounds", () => {
  it("rejects an over-length formula", () => {
    const long = "a" + " + a".repeat(MAX_FORMULA_LENGTH); // well over the cap
    expect(long.length).toBeGreaterThan(MAX_FORMULA_LENGTH);
    expect(() => evaluateArithmetic(long, { a: 1 })).toThrow(FormulaError);
  });

  it("rejects excessively nested parentheses instead of blowing the stack", () => {
    const depth = MAX_EXPRESSION_DEPTH + 50;
    const nested = "(".repeat(depth) + "a" + ")".repeat(depth);
    expect(() => evaluateArithmetic(nested, { a: 1 })).toThrow(FormulaError);
  });

  it("rejects a long unary chain instead of blowing the stack", () => {
    const chain = "-".repeat(MAX_EXPRESSION_DEPTH + 50) + "a";
    expect(() => evaluateArithmetic(chain, { a: 1 })).toThrow(FormulaError);
  });

  it("still evaluates nesting within the bound", () => {
    const depth = 10;
    const nested = "(".repeat(depth) + "a + b" + ")".repeat(depth);
    expect(evaluateArithmetic(nested, { a: 2, b: 3 })).toBe(5);
  });
});

describe("analyzeFormula — variables", () => {
  it("returns distinct identifiers in first-seen order", () => {
    expect(analyzeFormula("b + a + b * (a - c)").variables).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("excludes numeric literals", () => {
    expect(analyzeFormula("a + 2.5 * 3").variables).toEqual(["a"]);
  });

  it("is empty for a formula with no variables", () => {
    expect(analyzeFormula("1 + 2").variables).toEqual([]);
    expect(analyzeFormula("").variables).toEqual([]);
  });

  it("still surfaces identifiers from a formula the tokenizer rejects", () => {
    // a broken KPI formula must still report its intended inputs so the
    // "needs setup or repair" check can flag the unbound variable.
    expect(analyzeFormula("revenue @ costs").variables).toEqual([
      "revenue",
      "costs",
    ]);
  });
});

describe("evaluateArithmeticWithAliases — multi-word variable names", () => {
  it("evaluates a formula whose variables contain spaces", () => {
    expect(
      evaluateArithmeticWithAliases(
        "Operating Expenses + Administrative Expenses",
        { "Operating Expenses": 100, "Administrative Expenses": 25 },
      ),
    ).toBe(125);
  });

  it("substitutes the longer name first (prefix collision)", () => {
    expect(
      evaluateArithmeticWithAliases("Total Income - Other Income", {
        "Total Income": 900,
        "Other Income": 100,
      }),
    ).toBe(800);
  });

  it("mixes slug and multi-word names", () => {
    expect(
      evaluateArithmeticWithAliases("rate * Units Sold", {
        rate: 0.5,
        "Units Sold": 40,
      }),
    ).toBe(20);
  });

  it("passes straight through when every key is a slug", () => {
    expect(evaluateArithmeticWithAliases("a + b", { a: 2, b: 3 })).toBe(5);
  });

  it("still throws on an unknown variable", () => {
    expect(() =>
      evaluateArithmeticWithAliases("Known Value + mystery", {
        "Known Value": 1,
      }),
    ).toThrow(FormulaError);
  });

  it("refuses a punctuation-only variable name", () => {
    expect(() =>
      evaluateArithmeticWithAliases("a + b", { a: 1, "+": 2, b: 3 }),
    ).toThrow(FormulaError);
  });
});

describe("analyzeFormula — isPureAddition", () => {
  const truthTable: Array<[string, boolean]> = [
    ["a + b + c", true],
    ["(a + b) + c", true],
    ["a + 2 + b", true],
    ["a", true],
    ["a - b", false],
    ["-a + b", false],
    ["a + b * 2", false],
    ["a / b + c", false],
    ["", false],
    ["   ", false],
    ["1 + 2", true],
    ["a + @", false],
  ];
  it.each(truthTable)("%j → %s", (formula, expected) => {
    expect(analyzeFormula(formula).isPureAddition).toBe(expected);
  });
});
