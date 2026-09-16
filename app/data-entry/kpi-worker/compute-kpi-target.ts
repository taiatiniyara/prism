import { analyzeFormula } from "@/lib/formula/arithmetic";
import { executeWithRetry, isTransientDbError } from "@/lib/retry";

import { evaluateKpiFormula } from "./evaluator";
import { extractErrorMetadata } from "./error-metadata";
import { upsertCalculatedKpiValue } from "./persistKpi";
import { resolveFormulaInputValues } from "./resolveInputs";
import type { ResolvedKpiTarget } from "./resolveTargets";
import type { KpiCalculationFailureType, KpiWorkerScope } from "./types";

export type ComputeKpiOutcome =
  | { status: "ok"; value: string; zeroFilled: string[] }
  | {
      status: "failed";
      failureType: KpiCalculationFailureType;
      reason: string;
    };

export interface ComputeKpiTargetArgs {
  target: ResolvedKpiTarget;
  scope: KpiWorkerScope;
  /** notified before each retry of the persist step (for attempt tracking). */
  onRetry?: (retryCount: number, error: unknown) => Promise<void> | void;
}

/**
 * The single per-(KPI target × scope) compute step, shared by the
 * data-entry-triggered worker and the manual "Compute now" path so they can
 * never disagree on the result:
 *
 *   resolve inputs → (zero-fill missing for a pure-addition formula, else fail)
 *   → evaluate → persist (with transient-error retry).
 *
 * Returns an outcome; the caller owns attempt tracking, locking and batching.
 */
export const computeKpiTarget = async ({
  target,
  scope,
  onRetry,
}: ComputeKpiTargetArgs): Promise<ComputeKpiOutcome> => {
  const resolved = await resolveFormulaInputValues({
    formulaInputs: target.formulaInputs,
    kpiAggLevelId: target.strataId,
    scope,
  });

  const variables: Record<string, number> = { ...resolved.variables };
  const zeroFilled: string[] = [];

  if (resolved.missingVariables.length > 0) {
    // A missing input contributes 0 (instead of failing) when the formula is
    // pure addition OR the input is explicitly marked optional (#3, 2026-09-16).
    // A missing MANDATORY input in a non-additive formula still fails.
    const pureAddition = analyzeFormula(target.formula).isPureAddition;
    const optionalNames = new Set(
      target.formulaInputs
        .filter((fi) => fi.is_optional)
        .map((fi) => fi.variable_name),
    );
    const stillMissing: string[] = [];
    for (const variableName of resolved.missingVariables) {
      if (pureAddition || optionalNames.has(variableName)) {
        variables[variableName] = 0;
        zeroFilled.push(variableName);
      } else {
        stillMissing.push(variableName);
      }
    }
    if (stillMissing.length > 0) {
      return {
        status: "failed",
        failureType: "missing-input",
        reason: `Missing formula inputs: ${stillMissing.join(", ")}`,
      };
    }
  }

  const evaluation = evaluateKpiFormula(target.formula, variables);
  if (evaluation.status === "error") {
    return {
      status: "failed",
      failureType: evaluation.failureType,
      reason: evaluation.failureReason,
    };
  }

  try {
    await executeWithRetry(
      () =>
        upsertCalculatedKpiValue({
          reportPeriodId: scope.reportPeriodId,
          kpiDefId: target.kpiDefId,
          actualValue: evaluation.value,
          formulaVersion: target.formulaVersion,
          targetValue: target.targetValue,
        }),
      { maxRetries: 3, baseDelayMs: 200 },
      onRetry,
    );
  } catch (error) {
    console.error("[KPI worker] KPI table write failed", {
      reportPeriodId: scope.reportPeriodId,
      kpiDefId: target.kpiDefId,
      formulaVersion: target.formulaVersion,
      actualValue: evaluation.value,
      error: String(error),
      ...extractErrorMetadata(error),
    });
    return {
      status: "failed",
      failureType: isTransientDbError(error) ? "transient-infra" : "unexpected",
      reason: String(error),
    };
  }

  return { status: "ok", value: evaluation.value, zeroFilled };
};
