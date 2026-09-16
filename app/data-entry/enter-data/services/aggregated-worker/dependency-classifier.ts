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
  /** inputs marked optional — a missing value for these is zero-filled even in
   * a non-additive formula (#3, 2026-09-16). */
  optionalVariables?: ReadonlySet<string>,
): DependencyClassification => {
  const pureAddition = analyzeFormula(formula).isPureAddition;
  const canZeroFill = (name: string) =>
    pureAddition || (optionalVariables?.has(name) ?? false);
  const numericVariables: Record<string, number> = {};

  for (const variableName of variableNames) {
    if (!(variableName in variableValues)) {
      if (canZeroFill(variableName)) {
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
      if (canZeroFill(variableName)) {
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
