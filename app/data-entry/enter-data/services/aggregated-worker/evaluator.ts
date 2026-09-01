import type { AggregatedSkipReason } from "@/app/data-entry/enter-data/services/aggregated-worker/dependency-classifier";

export interface EvaluationResult {
  status: "calculated" | "skipped";
  value?: string;
  reason?: AggregatedSkipReason;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isIdentifier = (value: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);

export const evaluateFormula = (
  formula: string,
  variables: Record<string, number>,
): EvaluationResult => {
  try {
    const entries = Object.entries(variables).sort(
      ([left], [right]) => right.length - left.length,
    );

    let rewrittenFormula = formula;
    const safeNames: string[] = [];
    const values: number[] = [];

    entries.forEach(([name, value], index) => {
      const safeName = `__v${index}`;
      /* eslint-disable security/detect-non-literal-regexp -- name is sanitized via escapeRegExp before constructing the RegExp */
      const pattern = isIdentifier(name)
        ? new RegExp(`\\b${escapeRegExp(name)}\\b`, "g")
        : new RegExp(escapeRegExp(name), "g");
      /* eslint-enable security/detect-non-literal-regexp */

      rewrittenFormula = rewrittenFormula.replace(pattern, safeName);
      safeNames.push(safeName);
      values.push(value);
    });

    const SANITIZED_REGEX = /^[\s\d+\-*/%().,<>=!&|?:A-Za-z_]+$/;
    if (!SANITIZED_REGEX.test(rewrittenFormula)) {
      return {
        status: "skipped",
        reason: "evaluation-error",
      };
    }

    const expression = new Function(
      ...safeNames,
      `return (${rewrittenFormula});`,
    );
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
