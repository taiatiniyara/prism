import type { KpiCalculationFailureType } from "./types";
import { evaluateArithmetic, FormulaError } from "@/lib/formula/arithmetic";

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

/**
 * Evaluate a KPI/measure formula.
 *
 * The formula language is pure arithmetic (`+ - * / ( )`, unary +/-, numbers,
 * variables). Evaluation goes through the shared eval-free parser
 * (`lib/formula/arithmetic.ts`) — NO `new Function`/eval — so this is safe to
 * run server-side and identical to the client Test harness. The parser is
 * fail-closed: any non-arithmetic token throws, which maps to a
 * `formula-invalid` failure rather than silently evaluating.
 */
export const evaluateKpiFormula = (
  formula: string,
  variables: Record<string, FormulaVariableValue>,
): KpiFormulaEvaluationResult => {
  if (formula.trim().length === 0) {
    return {
      status: "error",
      failureType: "formula-invalid",
      failureReason: "Formula text is empty.",
    };
  }

  // Coerce inputs; a missing/non-numeric bound value is an evaluation error
  // (preserved from the previous behaviour, distinct from a bad formula).
  const numericVariables: Record<string, number> = {};
  for (const [name, raw] of Object.entries(variables)) {
    const numeric = toFiniteNumber(raw);
    if (numeric == null) {
      return {
        status: "error",
        failureType: "evaluation-error",
        failureReason: "Formula input value is missing or non-numeric.",
      };
    }
    numericVariables[name] = numeric;
  }

  try {
    const numeric = evaluateArithmetic(formula, numericVariables);
    return {
      status: "ok",
      value: String(numeric),
    };
  } catch (error) {
    if (error instanceof FormulaError) {
      // A "value" error (unknown/missing variable, non-finite result) is an
      // evaluation error; syntax/range problems are an invalid formula.
      return {
        status: "error",
        failureType:
          error.kind === "value" ? "evaluation-error" : "formula-invalid",
        failureReason: error.message,
      };
    }
    return {
      status: "error",
      failureType: "formula-invalid",
      failureReason: "Formula execution failed.",
    };
  }
};
