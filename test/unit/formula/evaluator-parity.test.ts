import { describe, expect, it } from "vitest";

import { evaluateFormula } from "@/app/data-entry/enter-data/services/aggregated-worker/evaluator";
import { evaluateKpiFormula } from "@/app/data-entry/kpi-worker/evaluator";

/**
 * Regression pin: the KPI worker and the aggregated (calculated-measure)
 * worker must evaluate a formula the same way. They drifted once — the
 * aggregated worker kept a `new Function` evaluator with a wider grammar after
 * the KPI path was hardened. Both now route through
 * `lib/formula/arithmetic.ts`; this guards against them separating again.
 */
describe("evaluator parity — KPI worker vs aggregated worker", () => {
  const agree: Array<[string, Record<string, number>, string]> = [
    ["a + b", { a: 2, b: 3 }, "5"],
    ["(a + b) * c", { a: 1, b: 2, c: 4 }, "12"],
    ["a / b", { a: 9, b: 2 }, "4.5"],
    ["a - b * c", { a: 10, b: 2, c: 3 }, "4"],
    ["-a + b", { a: 5, b: 1 }, "-4"],
  ];

  it.each(agree)("agree on the value of %j", (formula, vars, expected) => {
    const kpi = evaluateKpiFormula(formula, vars);
    const agg = evaluateFormula(formula, vars);
    expect(agg.status).toBe("calculated");
    // toMatchObject narrows the KPI result's discriminated union (status 'ok'
    // carries `value`) without an unchecked property access.
    expect(kpi).toMatchObject({ status: "ok", value: expected });
    expect(agg.value).toBe(expected);
  });

  const reject: Array<[string, Record<string, number>]> = [
    ["a / b", { a: 1, b: 0 }], // non-finite result
    ["a + (", { a: 1 }], // syntax error
    ["a + missing", { a: 1 }], // unknown variable
    ["a && b", { a: 1, b: 1 }], // outside the arithmetic grammar
    ["a > b ? a : b", { a: 1, b: 2 }], // ternary / comparison
    ["a % b", { a: 5, b: 2 }], // modulo
  ];

  it.each(reject)("both reject %j", (formula, vars) => {
    expect(evaluateKpiFormula(formula, vars).status).toBe("error");
    expect(evaluateFormula(formula, vars).status).toBe("skipped");
  });
});
