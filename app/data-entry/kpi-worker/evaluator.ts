import type { KpiCalculationFailureType } from "./types";

export type FormulaVariableValue = string | number | null | undefined;

export interface KpiFormulaEvaluationResult {
  status: "ok" | "error";
  value?: string;
  failureType?: KpiCalculationFailureType;
  failureReason?: string;
}

const toFiniteNumber = (value: FormulaVariableValue): number | null => {
  if (value == null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const evaluateKpiFormula = (
  formula: string,
  variables: Record<string, FormulaVariableValue>,
): KpiFormulaEvaluationResult => {
  const normalizedFormula = formula
    .replace(/\bAND\b/gi, "&&")
    .replace(/\bOR\b/gi, "||");

  if (normalizedFormula.trim().length === 0) {
    return {
      status: "error",
      failureType: "formula-invalid",
      failureReason: "Formula text is empty.",
    };
  }

  const names = Object.keys(variables);
  const values = names.map((name) => toFiniteNumber(variables[name]));

  if (values.some((value) => value == null)) {
    return {
      status: "error",
      failureType: "evaluation-error",
      failureReason: "Formula input value is missing or non-numeric.",
    };
  }

  try {
    // Formula text is configured by trusted admin workflows.
    const evaluator = new Function(...names, `return (${normalizedFormula});`);
    const computed = evaluator(...(values as number[]));
    const numeric = Number(computed);

    if (!Number.isFinite(numeric)) {
      return {
        status: "error",
        failureType: "evaluation-error",
        failureReason: "Formula result is not a finite number.",
      };
    }

    return {
      status: "ok",
      value: String(numeric),
    };
  } catch {
    return {
      status: "error",
      failureType: "formula-invalid",
      failureReason: "Formula execution failed.",
    };
  }
};
