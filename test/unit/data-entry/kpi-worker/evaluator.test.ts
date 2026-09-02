import { describe, expect, it } from "vitest";

import { evaluateKpiFormula } from "@/app/data-entry/kpi-worker/evaluator";

describe("evaluateKpiFormula — success", () => {
  it("evaluates a sum and returns the value as a string", () => {
    expect(evaluateKpiFormula("a + b + c", { a: 1, b: 2, c: 3 })).toEqual({
      status: "ok",
      value: "6",
    });
  });

  it("coerces string inputs to numbers", () => {
    expect(evaluateKpiFormula("a * b", { a: "2", b: "3" })).toEqual({
      status: "ok",
      value: "6",
    });
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
    expect(evaluateKpiFormula(formula, vars)).toEqual({
      status: "ok",
      value: "360",
    });
  });

  it("computes the real Profit formula (with subtraction)", () => {
    expect(
      evaluateKpiFormula("revenue - cost + other", {
        revenue: 100,
        cost: 40,
        other: 5,
      }),
    ).toEqual({ status: "ok", value: "65" });
  });
});

describe("evaluateKpiFormula — failure mapping", () => {
  it("empty formula → formula-invalid", () => {
    expect(evaluateKpiFormula("   ", { a: 1 })).toMatchObject({
      status: "error",
      failureType: "formula-invalid",
    });
  });

  it("missing/non-numeric input value → evaluation-error", () => {
    expect(evaluateKpiFormula("a + b", { a: 1, b: null })).toMatchObject({
      status: "error",
      failureType: "evaluation-error",
    });
  });

  it("non-arithmetic token → formula-invalid (fail-closed, no eval)", () => {
    expect(evaluateKpiFormula("a && b", { a: 1, b: 2 })).toMatchObject({
      status: "error",
      failureType: "formula-invalid",
    });
  });

  it("division by zero → evaluation-error (non-finite result)", () => {
    expect(evaluateKpiFormula("a / b", { a: 1, b: 0 })).toMatchObject({
      status: "error",
      failureType: "evaluation-error",
    });
  });

  it("attempted property access is rejected, not evaluated", () => {
    expect(evaluateKpiFormula("a.constructor", { a: 1 }).status).toBe("error");
  });
});
