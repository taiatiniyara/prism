import type { FormulaInput } from "@/db/schema/dataEntry";

const RESERVED_TOKENS = new Set([
  "Math",
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity",
]);

const VARIABLE_TOKEN = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;

export const extractFormulaVariables = (
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

  if (!formula?.trim()) {
    return [];
  }

  const matches = formula.match(VARIABLE_TOKEN) ?? [];
  const variables = matches.filter((token) => {
    if (RESERVED_TOKENS.has(token)) {
      return false;
    }

    // Numbers may be matched by unusual formula syntax, guard explicitly.
    return Number.isNaN(Number(token));
  });

  return [...new Set(variables)];
};
