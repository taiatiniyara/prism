import { analyzeFormula } from "@/lib/formula/arithmetic";

export type AggregatedSkipReason =
  | "missing-value"
  | "unknown-variable"
  | "evaluation-error";

export interface DependencyClassification {
  status: "ready" | "skipped";
  reason?: AggregatedSkipReason;
  variables: Record<string, number>;
}

export const classifyDependencies = (
  formula: string,
  variableNames: string[],
  variableValues: Record<string, string | null | undefined>,
): DependencyClassification => {
  const zeroFillMissing = analyzeFormula(formula).isPureAddition;
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
