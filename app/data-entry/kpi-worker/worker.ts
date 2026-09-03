import { randomUUID } from "node:crypto";

import type { CurrentUser } from "@/lib/user.service";

import { computeKpiTarget } from "./compute-kpi-target";
import { extractErrorMetadata } from "./error-metadata";
import {
  createKpiCalculationAttempt,
  markAttemptCompleted,
  markAttemptFailed,
  markAttemptProcessing,
  markAttemptRetryPending,
} from "./repository";
import { resolveAffectedKpiTargets } from "./resolveTargets";
import { assertKpiWorkerScopeAuthorization } from "./scopeGuard";
import {
  acquireScopeLock,
  consumeDeferredFollowUp,
  markDeferredFollowUp,
  releaseScopeLock,
} from "./lock";
import type { KpiWorkerRunResult, KpiWorkerTrigger } from "./types";

const createScopeFollowUpTrigger = (
  trigger: KpiWorkerTrigger,
): KpiWorkerTrigger => ({
  ...trigger,
  triggerId: randomUUID(),
  triggeredAt: new Date().toISOString(),
});

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
    unitId: trigger.scope.unitId ?? null,
  });

  if (user) {
    await assertKpiWorkerScopeAuthorization(user, trigger.scope);
  }

  if (!(await acquireScopeLock(trigger.scope))) {
    markDeferredFollowUp(trigger.scope);

    console.warn("[KPI worker] run deferred due to scope lock", {
      runId,
      reportPeriodId: trigger.scope.reportPeriodId,
      serviceAreaId: trigger.scope.serviceAreaId ?? null,
      unitId: trigger.scope.unitId ?? null,
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
      await markAttemptProcessing(attempt.id);

      const outcome = await computeKpiTarget({
        target,
        scope: trigger.scope,
        onRetry: (retryCount, error) =>
          markAttemptRetryPending(attempt.id, retryCount, String(error)),
      });

      if (outcome.status === "failed") {
        failedKpiCount += 1;
        await markAttemptFailed(
          attempt.id,
          outcome.failureType,
          outcome.reason,
        );
        console.warn("[KPI worker] KPI calculation failed", {
          runId,
          attemptId: attempt.id,
          kpiDefId: target.kpiDefId,
          reason: outcome.failureType,
          details: outcome.reason,
        });
        continue;
      }

      await markAttemptCompleted(attempt.id);
      processedKpiCount += 1;

      if (outcome.zeroFilled.length > 0) {
        console.info(
          "[KPI worker] zero-filled missing inputs for additive formula",
          {
            runId,
            attemptId: attempt.id,
            kpiDefId: target.kpiDefId,
            missingVariables: outcome.zeroFilled,
          },
        );
      }

      console.info("[KPI worker] KPI calculation completed", {
        runId,
        attemptId: attempt.id,
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
    await releaseScopeLock(trigger.scope);

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
    unitId: trigger.scope.unitId ?? null,
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
