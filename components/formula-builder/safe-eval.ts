/**
 * Client wrapper over the shared eval-free arithmetic evaluator
 * (`lib/formula/arithmetic.ts`). The Test harness runs in the browser, where
 * the strict CSP blocks `new Function`; this returns a result object instead
 * of throwing so the harness can render a friendly message.
 */

import { evaluateArithmetic, FormulaError } from "@/lib/formula/arithmetic";

export type SafeEvalResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export function safeEvaluateFormula(
  formula: string,
  variables: Record<string, number>,
): SafeEvalResult {
  try {
    return { ok: true, value: evaluateArithmetic(formula, variables) };
  } catch (e) {
    if (e instanceof FormulaError) {
      return { ok: false, error: e.message };
    }
    return { ok: false, error: "Unable to evaluate formula." };
  }
}
