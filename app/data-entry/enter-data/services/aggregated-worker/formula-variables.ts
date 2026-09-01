import type { FormulaInput } from "@/db/schema/dataEntry";
import { analyzeFormula } from "@/lib/formula/arithmetic";

const RESERVED_TOKENS = new Set([
  "Math",
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity",
]);

/**
 * The variable names a calculated-measure formula expects.
 *
 * Prefers the explicit binding `variable_name`s when the target carries them
 * (these may be multi-word, e.g. `"Operating Expenses"`); otherwise parses the
 * formula string via the shared analyser.
 */
export const formulaVariableNames = (
  formula: string,
  formulaInputs?: FormulaInput[] | null,
): string[] => {
  if (Array.isArray(formulaInputs) && formulaInputs.length > 0) {
    return [
      ...new Set(
        formulaInputs.map((item) => item.variable_name).filter(Boolean),
      ),
    ];
  }

  return analyzeFormula(formula).variables.filter(
    (name) => !RESERVED_TOKENS.has(name),
  );
};
