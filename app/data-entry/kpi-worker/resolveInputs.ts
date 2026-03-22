import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db/connection";
import type { FormulaInput } from "@/db/schema/dataEntry";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";

import type { KpiWorkerScope } from "./types";

export interface RollupCandidate {
  value: string | null;
  isDeleted: boolean;
  isRelevant: boolean;
  energyProviderId: number | null;
  energyTypeId: number | null;
  energySourceId: number | null;
}

export interface ResolveInputsRequest {
  formulaInputs: FormulaInput[];
  kpiAggLevelId: number | null;
  scope: KpiWorkerScope;
}

export interface ResolvedFormulaInputs {
  variables: Record<string, number>;
  missingVariables: string[];
}

const matchesNullableDimension = (
  actual: number | null,
  expected: number | null,
): boolean => {
  if (expected == null) {
    return actual == null;
  }

  return actual === expected;
};

const asNumber = (value: string | null): number | null => {
  if (value == null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const sumRollupValues = (
  rows: RollupCandidate[],
): { sum: number; hasValue: boolean } => {
  let sum = 0;
  let hasValue = false;

  for (const row of rows) {
    if (row.isDeleted || !row.isRelevant) {
      continue;
    }

    const numeric = asNumber(row.value);
    if (numeric == null) {
      continue;
    }

    sum += numeric;
    hasValue = true;
  }

  return { sum, hasValue };
};

const shouldRollup = (
  kpiAggLevelId: number | null,
  inputAggLevelId: number | null,
): boolean => {
  if (kpiAggLevelId == null || inputAggLevelId == null) {
    return false;
  }

  return kpiAggLevelId > inputAggLevelId;
};

export const resolveFormulaInputValues = async (
  request: ResolveInputsRequest,
): Promise<ResolvedFormulaInputs> => {
  if (request.formulaInputs.length === 0) {
    return {
      variables: {},
      missingVariables: [],
    };
  }

  const inputDefIds = [
    ...new Set(request.formulaInputs.map((item) => item.input_def_id)),
  ];

  const inputDefs = await db
    .select({
      id: inputDefinitions.id,
      aggLevelId: inputDefinitions.agg_level_id,
    })
    .from(inputDefinitions)
    .where(inArray(inputDefinitions.id, inputDefIds));

  const aggLevelMap = new Map<number, number | null>(
    inputDefs.map((row) => [row.id, row.aggLevelId]),
  );

  const scopeConditions: Array<
    ReturnType<typeof eq> | ReturnType<typeof isNull>
  > = [
    eq(dataEntries.report_period_id, request.scope.reportPeriodId),
    inArray(dataEntries.input_def_id, inputDefIds),
    eq(dataEntries.is_deleted, false),
    eq(dataEntries.is_relevant, true),
  ];

  if (request.scope.serviceAreaId == null) {
    scopeConditions.push(isNull(dataEntries.service_area_id));
  } else {
    scopeConditions.push(
      eq(dataEntries.service_area_id, request.scope.serviceAreaId),
    );
  }

  if (request.scope.energyResourceId == null) {
    scopeConditions.push(isNull(dataEntries.energy_resource_id));
  } else {
    scopeConditions.push(
      eq(dataEntries.energy_resource_id, request.scope.energyResourceId),
    );
  }

  if (request.scope.customerTypeId == null) {
    scopeConditions.push(isNull(dataEntries.customer_type_id));
  } else {
    scopeConditions.push(
      eq(dataEntries.customer_type_id, request.scope.customerTypeId),
    );
  }

  if (request.scope.paymentModeId == null) {
    scopeConditions.push(isNull(dataEntries.payment_mode_id));
  } else {
    scopeConditions.push(
      eq(dataEntries.payment_mode_id, request.scope.paymentModeId),
    );
  }

  const rows = await db
    .select({
      inputDefId: dataEntries.input_def_id,
      value: dataEntries.value,
      isDeleted: dataEntries.is_deleted,
      isRelevant: dataEntries.is_relevant,
      energyProviderId: dataEntries.energy_provider_id,
      energySourceId: dataEntries.energy_source_id,
    })
    .from(dataEntries)
    .where(and(...scopeConditions));

  const energySourceIds = [
    ...new Set(
      rows
        .map((row) => row.energySourceId)
        .filter((id): id is number => id != null),
    ),
  ];

  const energySourceParents =
    energySourceIds.length > 0
      ? await db
          .select({
            id: managedListItems.id,
            parentId: managedListItems.parent_id,
          })
          .from(managedListItems)
          .where(inArray(managedListItems.id, energySourceIds))
      : [];

  const energyTypeBySourceId = new Map<number, number | null>(
    energySourceParents.map((row) => [row.id, row.parentId ?? null]),
  );

  const byInputDef = new Map<number, RollupCandidate[]>();
  for (const row of rows) {
    const existing = byInputDef.get(row.inputDefId) ?? [];
    existing.push({
      ...row,
      energyTypeId:
        row.energySourceId != null
          ? (energyTypeBySourceId.get(row.energySourceId) ?? null)
          : null,
    });
    byInputDef.set(row.inputDefId, existing);
  }

  const variables: Record<string, number> = {};
  const missingVariables: string[] = [];

  for (const formulaInput of request.formulaInputs) {
    const sourceRows = byInputDef.get(formulaInput.input_def_id) ?? [];
    const effectiveEnergyProviderId =
      formulaInput.energy_provider_id ?? request.scope.energyProviderId ?? null;
    const effectiveEnergyTypeId =
      formulaInput.energy_type_id ?? request.scope.energyTypeId ?? null;
    const effectiveEnergySourceId =
      formulaInput.energy_source_id ?? request.scope.energySourceId ?? null;
    const candidates = sourceRows.filter(
      (candidate) =>
        matchesNullableDimension(
          candidate.energyProviderId,
          effectiveEnergyProviderId,
        ) &&
        matchesNullableDimension(
          candidate.energyTypeId,
          effectiveEnergyTypeId,
        ) &&
        matchesNullableDimension(
          candidate.energySourceId,
          effectiveEnergySourceId,
        ),
    );
    const inputAggLevelId = aggLevelMap.get(formulaInput.input_def_id) ?? null;

    if (shouldRollup(request.kpiAggLevelId, inputAggLevelId)) {
      const rollup = sumRollupValues(candidates);
      if (!rollup.hasValue) {
        missingVariables.push(formulaInput.variable_name);
        continue;
      }

      variables[formulaInput.variable_name] = rollup.sum;
      continue;
    }

    const firstValue = candidates[0] ?? null;
    const numeric = firstValue ? asNumber(firstValue.value) : null;

    if (numeric == null) {
      missingVariables.push(formulaInput.variable_name);
      continue;
    }

    variables[formulaInput.variable_name] = numeric;
  }

  return {
    variables,
    missingVariables,
  };
};
