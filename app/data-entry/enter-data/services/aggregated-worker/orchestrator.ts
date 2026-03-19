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
import type { CurrentUser } from "@/lib/user.service";

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

const buildVariableValueMap = (
  snapshot: WorkerSnapshot,
  variables: string[],
): Record<string, string | null | undefined> => {
  const map: Record<string, string | null | undefined> = {};
  variables.forEach((name) => {
    map[name] = snapshot.values.byVariable[name];
  });

  return map;
};

export const runAggregatedWorker = async (
  user: CurrentUser,
  scope: AggregatedWorkerScope,
): Promise<{ runId: string; outcomes: AggregatedTargetOutcome[] }> => {
  await assertScopeAuthorization(user, scope);

  const runId = randomUUID();
  const startedAt = new Date().toISOString();

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
  );
  const outcomes: AggregatedTargetOutcome[] = [];

  for (const target of targets) {
    const variables = extractFormulaVariables(
      target.formula,
      target.formulaInputs,
    );
    const valueMap = buildVariableValueMap(snapshot, variables);
    const classification = classifyDependencies(variables, valueMap);

    if (classification.status === "skipped") {
      outcomes.push(
        buildSkippedOutcome(runId, target.inputDefId, classification.reason!),
      );
      continue;
    }

    const result = evaluateFormula(target.formula, classification.variables);
    if (result.status === "skipped") {
      outcomes.push(
        buildSkippedOutcome(runId, target.inputDefId, result.reason!),
      );
      continue;
    }

    await writeCalculatedTargetValue({
      inputDefId: target.inputDefId,
      value: result.value!,
      scope,
    });

    outcomes.push(
      buildCalculatedOutcome(runId, target.inputDefId, result.value!),
    );
  }

  storeRunOutcomes(runId, outcomes);

  return {
    runId,
    outcomes,
  };
};

export const runAggregatedWorkerAsync = (
  user: CurrentUser,
  scope: AggregatedWorkerScope,
): void => {
  queueMicrotask(() => {
    void runAggregatedWorker(user, scope).catch((error) => {
      console.error("Aggregated worker run failed", error);
    });
  });
};
