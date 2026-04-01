import { randomUUID } from "node:crypto";

import type { CurrentUser } from "@/lib/user.service";

import {
  markDeferredFollowUpForScope,
  createKpiCalculationAttempt,
  markAttemptCompleted,
  markAttemptFailed,
  markAttemptProcessing,
  markAttemptRetryPending,
} from "./repository";
import { evaluateKpiFormula } from "./evaluator";
import { upsertCalculatedKpiValue } from "./persistKpi";
import { executeWithRetry, isTransientKpiError } from "./retry";
import { resolveFormulaInputValues } from "./resolveInputs";
import { resolveAffectedKpiTargets } from "./resolveTargets";
import { assertKpiWorkerScopeAuthorization } from "./scopeGuard";
import {
  acquireScopeLock,
  consumeDeferredFollowUp,
  markDeferredFollowUp,
  releaseScopeLock,
} from "./lock";
import type { KpiWorkerRunResult, KpiWorkerTrigger } from "./types";

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

const createScopeFollowUpTrigger = (
  trigger: KpiWorkerTrigger,
): KpiWorkerTrigger => ({
  ...trigger,
  triggerId: randomUUID(),
  triggeredAt: new Date().toISOString(),
});

const extractErrorMetadata = (error: unknown) => {
  const baseError =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const cause =
    baseError && typeof baseError.cause === "object" && baseError.cause !== null
      ? (baseError.cause as Record<string, unknown>)
      : null;

  const pick = (key: string): string | null => {
    const fromBase = baseError?.[key];
    if (typeof fromBase === "string" && fromBase.length > 0) {
      return fromBase;
    }

    const fromCause = cause?.[key];
    if (typeof fromCause === "string" && fromCause.length > 0) {
      return fromCause;
    }

    return null;
  };

  return {
    code: pick("code"),
    detail: pick("detail"),
    constraint: pick("constraint"),
    table: pick("table"),
    column: pick("column"),
    schema: pick("schema"),
  };
};

export async function runKpiWorker(
  trigger: KpiWorkerTrigger,
  user?: CurrentUser,
): Promise<KpiWorkerRunResult> {
  const runId = trigger.triggerId ?? randomUUID();

  console.info("[KPI worker] run started", {
    runId,
    sourceDataEntryId: trigger.sourceDataEntryId,
    inputDefId: trigger.inputDefId,
    reportPeriodId: trigger.scope.reportPeriodId,
    serviceAreaId: trigger.scope.serviceAreaId ?? null,
    energyResourceId: trigger.scope.energyResourceId ?? null,
  });

  if (user) {
    await assertKpiWorkerScopeAuthorization(user, trigger.scope);
  }

  if (!acquireScopeLock(trigger.scope)) {
    markDeferredFollowUp(trigger.scope);
    await markDeferredFollowUpForScope(
      trigger.scope.reportPeriodId,
      trigger.scope,
    );

    console.warn("[KPI worker] run deferred due to scope lock", {
      runId,
      reportPeriodId: trigger.scope.reportPeriodId,
      serviceAreaId: trigger.scope.serviceAreaId ?? null,
      energyResourceId: trigger.scope.energyResourceId ?? null,
    });

    return {
      runId,
      status: "pending",
      processedKpiCount: 0,
      failedKpiCount: 0,
    };
  }

  let attemptId: string | null = null;
  let processedKpiCount = 0;
  let failedKpiCount = 0;

  try {
    const targets = await resolveAffectedKpiTargets(
      trigger.inputDefId,
      trigger.scope,
    );

    for (const target of targets) {
      const attempt = await createKpiCalculationAttempt({
        triggerId: runId,
        sourceDataEntryId: trigger.sourceDataEntryId,
        reportPeriodId: trigger.scope.reportPeriodId,
        scope: trigger.scope,
        kpiDefId: target.kpiDefId,
        formulaVersion: target.formulaVersion,
      });

      attemptId = attempt.id;
      const currentAttemptId = attempt.id;
      await markAttemptProcessing(currentAttemptId);

      const resolvedInputs = await resolveFormulaInputValues({
        formulaInputs: target.formulaInputs,
        kpiAggLevelId: target.aggLevelId,
        scope: trigger.scope,
      });

      const variablesForEvaluation = {
        ...resolvedInputs.variables,
      } as Record<string, number>;

      const zeroFillMissing = isPureAdditionFormula(target.formula);
      if (zeroFillMissing && resolvedInputs.missingVariables.length > 0) {
        for (const variableName of resolvedInputs.missingVariables) {
          variablesForEvaluation[variableName] = 0;
        }

        console.info(
          "[KPI worker] zero-filled missing inputs for additive formula",
          {
            runId,
            attemptId: currentAttemptId,
            kpiDefId: target.kpiDefId,
            missingVariables: resolvedInputs.missingVariables,
          },
        );
      }

      if (!zeroFillMissing && resolvedInputs.missingVariables.length > 0) {
        failedKpiCount += 1;
        await markAttemptFailed(
          currentAttemptId,
          "missing-input",
          `Missing formula inputs: ${resolvedInputs.missingVariables.join(", ")}`,
        );

        console.warn("[KPI worker] KPI calculation failed", {
          runId,
          attemptId: currentAttemptId,
          kpiDefId: target.kpiDefId,
          reason: "missing-input",
          details: resolvedInputs.missingVariables,
        });
        continue;
      }

      const evaluation = evaluateKpiFormula(
        target.formula,
        variablesForEvaluation,
      );
      if (evaluation.status === "error") {
        failedKpiCount += 1;
        await markAttemptFailed(
          currentAttemptId,
          evaluation.failureType ?? "evaluation-error",
          evaluation.failureReason ?? "Formula evaluation failed.",
        );

        console.warn("[KPI worker] KPI calculation failed", {
          runId,
          attemptId: currentAttemptId,
          kpiDefId: target.kpiDefId,
          reason: evaluation.failureType ?? "evaluation-error",
          details: evaluation.failureReason ?? "Formula evaluation failed.",
        });
        continue;
      }

      try {
        await executeWithRetry(
          async () => {
            await upsertCalculatedKpiValue({
              reportPeriodId: trigger.scope.reportPeriodId,
              kpiDefId: target.kpiDefId,
              actualValue: evaluation.value!,
              formulaVersion: target.formulaVersion,
              targetValue: target.targetValue,
            });
          },
          {
            maxRetries: 3,
            baseDelayMs: 200,
          },
          async (retryCount, error) => {
            await markAttemptRetryPending(
              currentAttemptId,
              retryCount,
              String(error),
            );
          },
        );
      } catch (error) {
        console.error("[KPI worker] KPI table write failed", {
          sourceDataEntryId: trigger.sourceDataEntryId,
          inputDefId: trigger.inputDefId,
          reportPeriodId: trigger.scope.reportPeriodId,
          kpiDefId: target.kpiDefId,
          formulaVersion: target.formulaVersion,
          actualValue: evaluation.value ?? null,
          error: String(error),
          ...extractErrorMetadata(error),
        });

        failedKpiCount += 1;
        await markAttemptFailed(
          currentAttemptId,
          isTransientKpiError(error) ? "transient-infra" : "unexpected",
          String(error),
        );
        continue;
      }

      await markAttemptCompleted(currentAttemptId);
      processedKpiCount += 1;

      console.info("[KPI worker] KPI calculation completed", {
        runId,
        attemptId: currentAttemptId,
        kpiDefId: target.kpiDefId,
        formulaVersion: target.formulaVersion,
      });
    }

    const finalStatus = failedKpiCount > 0 ? "failed" : "completed";

    console.info("[KPI worker] run finished", {
      runId,
      status: finalStatus,
      processedKpiCount,
      failedKpiCount,
    });

    return {
      runId,
      status: finalStatus,
      processedKpiCount,
      failedKpiCount,
    };
  } catch (error) {
    console.error("[KPI worker] run failed unexpectedly", {
      runId,
      sourceDataEntryId: trigger.sourceDataEntryId,
      inputDefId: trigger.inputDefId,
      reportPeriodId: trigger.scope.reportPeriodId,
      error: String(error),
      ...extractErrorMetadata(error),
    });

    if (attemptId) {
      await markAttemptFailed(attemptId, "unexpected", String(error));
    }

    return {
      runId,
      status: "failed",
      processedKpiCount: 0,
      failedKpiCount: 1,
    };
  } finally {
    releaseScopeLock(trigger.scope);

    if (consumeDeferredFollowUp(trigger.scope)) {
      queueMicrotask(() => {
        void runKpiWorker(createScopeFollowUpTrigger(trigger), user).catch(
          (followUpError) => {
            console.error("Deferred KPI follow-up failed", followUpError);
          },
        );
      });
    }
  }
}

export function runKpiWorkerAsync(
  trigger: KpiWorkerTrigger,
  user?: CurrentUser,
): void {
  console.info("[KPI worker] async trigger received", {
    sourceDataEntryId: trigger.sourceDataEntryId,
    inputDefId: trigger.inputDefId,
    reportPeriodId: trigger.scope.reportPeriodId,
    serviceAreaId: trigger.scope.serviceAreaId ?? null,
    energyResourceId: trigger.scope.energyResourceId ?? null,
  });

  queueMicrotask(() => {
    console.info("[KPI worker] async run started", {
      sourceDataEntryId: trigger.sourceDataEntryId,
      inputDefId: trigger.inputDefId,
      reportPeriodId: trigger.scope.reportPeriodId,
    });

    void runKpiWorker(trigger, user).catch((error) => {
      console.error("KPI worker run failed", error);
    });
  });
}
