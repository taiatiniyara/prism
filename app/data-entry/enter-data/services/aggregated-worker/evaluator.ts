import type { AggregatedSkipReason } from "@/app/data-entry/enter-data/services/aggregated-worker/dependency-classifier";

export interface EvaluationResult {
  status: "calculated" | "skipped";
  value?: string;
  reason?: AggregatedSkipReason;
}

export const evaluateFormula = (
  formula: string,
  variables: Record<string, number>,
): EvaluationResult => {
  try {
    const names = Object.keys(variables);
    const values = names.map((name) => variables[name]);

    // Formula text is authored in controlled input definition settings.
    const expression = new Function(...names, `return (${formula});`);
    const calculated = expression(...values);
    const numeric = Number(calculated);

    if (!Number.isFinite(numeric)) {
      return {
        status: "skipped",
        reason: "evaluation-error",
      };
    }

    return {
      status: "calculated",
      value: String(numeric),
    };
  } catch {
    return {
      status: "skipped",
      reason: "evaluation-error",
    };
  }
};
