export type AggregatedSkipReason =
  | "missing-value"
  | "unknown-variable"
  | "evaluation-error";

export interface DependencyClassification {
  status: "ready" | "skipped";
  reason?: AggregatedSkipReason;
  variables: Record<string, number>;
}

const isPureAdditionFormula = (formula: string): boolean => {
  const compact = formula.replace(/\s+/g, "");
  if (compact.length === 0) {
    return false;
  }

  if (compact.includes("-") || compact.includes("*") || compact.includes("/")) {
    return false;
  }

  const flattened = compact.replace(/[()]/g, "");
  const terms = flattened.split("+").filter((term) => term.length > 0);

  if (terms.length === 0) {
    return false;
  }

  return terms.every(
    (term) =>
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(term) || /^\d+(\.\d+)?$/.test(term),
  );
};

export const classifyDependencies = (
  formula: string,
  variableNames: string[],
  variableValues: Record<string, string | null | undefined>,
): DependencyClassification => {
  const zeroFillMissing = isPureAdditionFormula(formula);
  const numericVariables: Record<string, number> = {};

  for (const variableName of variableNames) {
    if (!(variableName in variableValues)) {
      if (zeroFillMissing) {
        numericVariables[variableName] = 0;
        continue;
      }

      return {
        status: "skipped",
        reason: "unknown-variable",
        variables: {},
      };
    }

    const rawValue = variableValues[variableName];

    if (rawValue == null || rawValue === "") {
      if (zeroFillMissing) {
        numericVariables[variableName] = 0;
        continue;
      }

      return {
        status: "skipped",
        reason: "missing-value",
        variables: {},
      };
    }

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return {
        status: "skipped",
        reason: "evaluation-error",
        variables: {},
      };
    }

    numericVariables[variableName] = numericValue;
  }

  return {
    status: "ready",
    variables: numericVariables,
  };
};
