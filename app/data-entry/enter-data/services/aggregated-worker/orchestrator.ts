import { randomUUID } from "crypto";

import { classifyDependencies } from "@/app/data-entry/enter-data/services/aggregated-worker/dependency-classifier";
import { evaluateFormula } from "@/app/data-entry/enter-data/services/aggregated-worker/evaluator";
import {
  buildCalculatedOutcome,
  buildSkippedOutcome,
  type AggregatedTargetOutcome,
} from "@/app/data-entry/enter-data/services/aggregated-worker/outcome-builder";
import {
  storeRunOutcomes,
  storeRunStart,
  storeRunFailure,
} from "@/app/data-entry/enter-data/services/aggregated-worker/outcome-store";
import { assertScopeAuthorization } from "@/app/data-entry/enter-data/services/aggregated-worker/scope-auth";
import {
  buildSourceSnapshot,
  type WorkerSnapshot,
} from "@/app/data-entry/enter-data/services/aggregated-worker/snapshot-builder";
import { type AggregatedWorkerScope } from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";
import { selectAggregatedFormulaTargets } from "@/app/data-entry/enter-data/services/aggregated-worker/target-selector";
import { writeCalculatedTargetValue } from "@/app/data-entry/enter-data/services/aggregated-worker/target-writer";
import { extractFormulaVariables } from "@/app/data-entry/enter-data/services/aggregated-worker/variable-parser";
import { triggerKpiWorker } from "@/app/data-entry/kpi-worker";
import type { CurrentUser } from "@/lib/user.service";

const MAX_PASS_MULTIPLIER = 2;

const collectAllVariables = (
  targets: Awaited<ReturnType<typeof selectAggregatedFormulaTargets>>,
): string[] => {
  const variables = new Set<string>();

  targets.forEach((target) => {
    extractFormulaVariables(target.formula, target.formulaInputs).forEach(
      (name) => {
        variables.add(name);
      },
    );
  });

  return [...variables];
};

const collectAllInputDefIds = (
  targets: Awaited<ReturnType<typeof selectAggregatedFormulaTargets>>,
): number[] => {
  const inputDefIds = new Set<number>();

  targets.forEach((target) => {
    inputDefIds.add(target.inputDefId);
    target.formulaInputs.forEach((formulaInput) => {
      inputDefIds.add(formulaInput.measure_def_id);
    });
  });

  return [...inputDefIds];
};

const buildTargetValueMap = (
  snapshot: WorkerSnapshot,
  target: Awaited<ReturnType<typeof selectAggregatedFormulaTargets>>[number],
  variables: string[],
): Record<string, string | null | undefined> => {
  const map: Record<string, string | null | undefined> = {};

  if (target.formulaInputs.length > 0) {
    target.formulaInputs.forEach((formulaInput) => {
      map[formulaInput.variable_name] =
        snapshot.values.byInputDefId[formulaInput.measure_def_id] ??
        snapshot.values.byVariable[formulaInput.variable_name];
    });

    return map;
  }

  variables.forEach((name) => {
    map[name] = snapshot.values.byVariable[name];
  });

  return map;
};

const buildInputDefVariableAliases = (
  targets: Awaited<ReturnType<typeof selectAggregatedFormulaTargets>>,
): Map<number, Set<string>> => {
  const aliases = new Map<number, Set<string>>();

  const addAlias = (inputDefId: number, variableName?: string | null) => {
    if (!variableName) {
      return;
    }

    const bucket = aliases.get(inputDefId) ?? new Set<string>();
    bucket.add(variableName);
    aliases.set(inputDefId, bucket);
  };

  for (const target of targets) {
    addAlias(target.inputDefId, target.variableName);
    for (const formulaInput of target.formulaInputs) {
      addAlias(formulaInput.measure_def_id, formulaInput.variable_name);
    }
  }

  return aliases;
};

const upsertVariableValues = (
  snapshot: WorkerSnapshot,
  aliases: Map<number, Set<string>>,
  inputDefId: number,
  value: string,
): void => {
  const variableNames = aliases.get(inputDefId);
  if (!variableNames) {
    return;
  }

  for (const variableName of variableNames) {
    snapshot.values.byVariable[variableName] = value;
  }

  snapshot.values.byInputDefId[inputDefId] = value;
};

const evaluateTargetWithSnapshot = (
  snapshot: WorkerSnapshot,
  target: Awaited<ReturnType<typeof selectAggregatedFormulaTargets>>[number],
):
  | {
      status: "calculated";
      value: string;
    }
  | {
      status: "skipped";
      reason: "missing-value" | "unknown-variable" | "evaluation-error";
    } => {
  const variables = extractFormulaVariables(
    target.formula,
    target.formulaInputs,
  );
  const valueMap = buildTargetValueMap(snapshot, target, variables);
  const classification = classifyDependencies(
    target.formula,
    variables,
    valueMap,
  );

  if (classification.status === "skipped") {
    return {
      status: "skipped",
      reason: classification.reason!,
    };
  }

  const result = evaluateFormula(target.formula, classification.variables);
  if (result.status === "skipped") {
    return {
      status: "skipped",
      reason: result.reason!,
    };
  }

  return {
    status: "calculated",
    value: result.value!,
  };
};

export const runAggregatedWorker = async (
  user: CurrentUser,
  scope: AggregatedWorkerScope,
): Promise<{ runId: string; outcomes: AggregatedTargetOutcome[] }> => {
  await assertScopeAuthorization(user, scope);

  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  console.info("[Aggregated worker] run started", {
    runId,
    reportPeriodId: scope.reportPeriodId,
    serviceAreaId: scope.serviceAreaId ?? null,
    energyResourceId: scope.energyResourceId ?? null,
  });

  storeRunStart({
    runId,
    scope,
    startedAt,
    status: "running",
    outcomes: [],
  });

  const targets = await selectAggregatedFormulaTargets();
  const snapshot = await buildSourceSnapshot(
    scope,
    collectAllVariables(targets),
    collectAllInputDefIds(targets),
  );
  const inputDefVariableAliases = buildInputDefVariableAliases(targets);
  const outcomes: AggregatedTargetOutcome[] = [];
  const kpiTriggerCandidates = new Map<number, string>();
  const pendingTargets = [...targets];
  const maxPassCount = Math.max(1, targets.length * MAX_PASS_MULTIPLIER);
  let passIndex = 0;

  while (pendingTargets.length > 0 && passIndex < maxPassCount) {
    passIndex += 1;
    let calculatedInPass = false;
    const pendingBeforePass = pendingTargets.length;

    for (let index = 0; index < pendingTargets.length; ) {
      const target = pendingTargets[index];
      const evaluation = evaluateTargetWithSnapshot(snapshot, target);

      if (evaluation.status === "skipped") {
        index += 1;
        continue;
      }

      const sourceDataEntryId = await writeCalculatedTargetValue({
        inputDefId: target.inputDefId,
        value: evaluation.value,
        scope,
      });
      kpiTriggerCandidates.set(target.inputDefId, sourceDataEntryId);

      outcomes.push(
        buildCalculatedOutcome(runId, target.inputDefId, evaluation.value),
      );

      upsertVariableValues(
        snapshot,
        inputDefVariableAliases,
        target.inputDefId,
        evaluation.value,
      );
      pendingTargets.splice(index, 1);
      calculatedInPass = true;
    }

    if (!calculatedInPass) {
      console.info("[Aggregated worker] pass stalled", {
        runId,
        passIndex,
        pendingCount: pendingTargets.length,
        pendingInputDefIds: pendingTargets.map((target) => target.inputDefId),
      });
      break;
    }

    console.info("[Aggregated worker] pass completed", {
      runId,
      passIndex,
      pendingBeforePass,
      pendingAfterPass: pendingTargets.length,
      calculatedInPass: pendingBeforePass - pendingTargets.length,
    });
  }

  if (pendingTargets.length > 0 && passIndex >= maxPassCount) {
    console.warn("[Aggregated worker] max pass count reached", {
      runId,
      maxPassCount,
      pendingCount: pendingTargets.length,
      pendingInputDefIds: pendingTargets.map((target) => target.inputDefId),
    });
  }

  for (const target of pendingTargets) {
    const evaluation = evaluateTargetWithSnapshot(snapshot, target);
    if (evaluation.status !== "skipped") {
      continue;
    }

    outcomes.push(
      buildSkippedOutcome(runId, target.inputDefId, evaluation.reason),
    );

    console.warn("[Aggregated worker] target skipped", {
      runId,
      inputDefId: target.inputDefId,
      reason: evaluation.reason,
      formula: target.formula,
      dependencyCount: target.formulaInputs.length,
    });
  }

  for (const [
    inputDefId,
    sourceDataEntryId,
  ] of kpiTriggerCandidates.entries()) {
    await triggerKpiWorker(
      {
        sourceDataEntryId,
        inputDefId,
        triggeredByUserId: user.id,
        scope: {
          reportPeriodId: scope.reportPeriodId,
          organizationId: user.org_id,
          serviceAreaId: scope.serviceAreaId,
          energyResourceId: scope.energyResourceId,
        },
      },
      user,
    );
  }

  storeRunOutcomes(runId, outcomes);

  const calculatedCount = outcomes.filter(
    (outcome) => outcome.status === "calculated",
  ).length;
  const skippedCount = outcomes.filter(
    (outcome) => outcome.status === "skipped",
  ).length;

  console.info("[Aggregated worker] run finished", {
    runId,
    status: "completed",
    targetCount: targets.length,
    calculatedCount,
    skippedCount,
  });

  return {
    runId,
    outcomes,
  };
};

export const runAggregatedWorkerAsync = (
  user: CurrentUser,
  scope: AggregatedWorkerScope,
): void => {
  const runId = `async-${randomUUID()}`;
  storeRunStart({
    runId,
    scope,
    startedAt: new Date().toISOString(),
    status: "running",
    outcomes: [],
  });

  queueMicrotask(() => {
    void runAggregatedWorker(user, scope).catch((error) => {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown aggregated worker error";
      console.error("[Aggregated worker] run failed", {
        reportPeriodId: scope.reportPeriodId,
        serviceAreaId: scope.serviceAreaId ?? null,
        energyResourceId: scope.energyResourceId ?? null,
        error: errorMessage,
      });
      storeRunFailure(runId, errorMessage);
    });
  });
};
