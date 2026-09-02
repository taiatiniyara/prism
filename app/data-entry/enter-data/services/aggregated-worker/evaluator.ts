import {
  evaluateArithmeticWithAliases,
  FormulaError,
} from "@/lib/formula/arithmetic";
import type { AggregatedSkipReason } from "@/app/data-entry/enter-data/services/aggregated-worker/dependency-classifier";

export interface EvaluationResult {
  status: "calculated" | "skipped";
  value?: string;
  reason?: AggregatedSkipReason;
}

/**
 * Evaluate a calculated-measure formula through the shared eval-free core
 * (`lib/formula/arithmetic.ts`). Calculated-measure formulas may be authored
 * with multi-word variable names, so this goes through the alias-aware entry
 * point; the grammar and fail-closed guarantees are otherwise identical to the
 * KPI worker's evaluator. Any `FormulaError` (bad syntax, unknown variable,
 * non-finite result) maps to a skipped outcome.
 */
export const evaluateFormula = (
  formula: string,
  variables: Record<string, number>,
): EvaluationResult => {
  try {
    const numeric = evaluateArithmeticWithAliases(formula, variables);
    return { status: "calculated", value: String(numeric) };
  } catch (error) {
    if (!(error instanceof FormulaError)) {
      // Unexpected — surface it rather than swallow silently.
      console.error("[aggregated-worker] formula evaluation threw", error);
    }
    return { status: "skipped", reason: "evaluation-error" };
  }
};
