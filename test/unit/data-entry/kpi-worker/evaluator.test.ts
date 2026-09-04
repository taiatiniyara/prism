import { describe, expect, it } from "vitest";

import { evaluateKpiFormula } from "@/app/data-entry/kpi-worker/evaluator";
import type { KpiFormulaEvaluationResult } from "@/app/data-entry/kpi-worker/evaluator";

// Narrow the discriminated union ({status:'ok',value} | {status:'error',...})
// before reading a branch-specific field — a wrong status fails the test.
const okValue = (r: KpiFormulaEvaluationResult): string => {
  if (r.status !== "ok") throw new Error(`expected ok, got "${r.status}"`);
  return r.value;
};
const errType = (r: KpiFormulaEvaluationResult): string => {
  if (r.status !== "error") throw new Error(`expected error, got "${r.status}"`);
  return r.failureType;
};

describe("evaluateKpiFormula — success", () => {
  it("evaluates a sum and returns the value as a string", () => {
    const result = evaluateKpiFormula("a + b + c", { a: 1, b: 2, c: 3 });
    expect(result.status).toBe("ok");
    expect(okValue(result)).toBe("6");
  });

  it("coerces string inputs to numbers", () => {
    const result = evaluateKpiFormula("a * b", { a: "2", b: "3" });
    expect(result.status).toBe("ok");
    expect(okValue(result)).toBe("6");
  });

  it("computes the real Total Costs formula", () => {
    // measure 230: sum of 8 cost components
    const vars = {
      electricity_staff_currency: 10,
      electricity_om_currency: 20,
      electricity_purchases_currency: 30,
      fuel_oil_expenditure_currency: 40,
      other_staff_currency: 50,
      other_om_currency: 60,
      duty_and_taxes_fuel_oil_currency: 70,
      duty_and_taxes_others_currency: 80,
    };
    const formula = Object.keys(vars).join(" + ");
    const result = evaluateKpiFormula(formula, vars);
    expect(result.status).toBe("ok");
    expect(okValue(result)).toBe("360");
  });

  it("computes the real Profit formula (with subtraction)", () => {
    const result = evaluateKpiFormula("revenue - cost + other", {
      revenue: 100,
      cost: 40,
      other: 5,
    });
    expect(result.status).toBe("ok");
    expect(okValue(result)).toBe("65");
  });
});

describe("evaluateKpiFormula — failure mapping", () => {
  it("empty formula → formula-invalid", () => {
    const result = evaluateKpiFormula("   ", { a: 1 });
    expect(result.status).toBe("error");
    expect(errType(result)).toBe("formula-invalid");
  });

  it("missing/non-numeric input value → evaluation-error", () => {
    const result = evaluateKpiFormula("a + b", { a: 1, b: null });
    expect(result.status).toBe("error");
    expect(errType(result)).toBe("evaluation-error");
  });

  it("non-arithmetic token → formula-invalid (fail-closed, no eval)", () => {
    const result = evaluateKpiFormula("a && b", { a: 1, b: 2 });
    expect(result.status).toBe("error");
    expect(errType(result)).toBe("formula-invalid");
  });

  it("division by zero → evaluation-error (non-finite result)", () => {
    const result = evaluateKpiFormula("a / b", { a: 1, b: 0 });
    expect(result.status).toBe("error");
    expect(errType(result)).toBe("evaluation-error");
  });

  it("attempted property access is rejected, not evaluated", () => {
    const result = evaluateKpiFormula("a.constructor", { a: 1 });
    expect(result.status).toBe("error");
  });
});
