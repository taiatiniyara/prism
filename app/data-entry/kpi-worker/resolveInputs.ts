import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import type { FormulaInput } from "@/db/schema/dataEntry";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";
import { managedListItems } from "@/db/schema/managedLists";

import { normalizeFormulaInput } from "./normalizeFormulaInput";
import type { KpiWorkerScope } from "./types";

export interface RollupCandidate {
  value: string | null;
  isDeleted: boolean;
  isRelevant: boolean;
  energyProviderId: number | null;
  energyTypeId: number | null;
  energySourceId: number | null;
  energyResourceTypeId: number | null;
  customerTypeId: number | null;
  paymentModeId: number | null;
  consumptionBandId: number | null;
  divisionId: number | null;
  genderId: number | null;
  utilityFunctionId: number | null;
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

/**
 * Medallion dimension match (doc §0.4). A binding is authoritative and exact,
 * except that an All-member binding also matches legacy NULL-tagged rows during
 * the transition. An unbound dimension falls back to the evaluation scope (for
 * the dims the scope carries) and otherwise to the All member.
 *
 * `actual === allMember || actual == null` is a strict superset of the old
 * "require NULL" rule: All-member ids don't exist on un-migrated rows, so this
 * returns identical candidates on today's NULL-tagged data and resolves
 * correctly once rows carry explicit All-member ids.
 */
const matchDimension = (
  actual: number | null,
  bound: number | null,
  scopeValue: number | null,
  allMember: number,
): boolean => {
  if (bound != null) {
    return bound === allMember
      ? actual === allMember || actual == null
      : actual === bound;
  }
  if (scopeValue != null) {
    return actual === scopeValue || actual === allMember || actual == null;
  }
  return actual === allMember || actual == null;
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
  const formulaInputs = request.formulaInputs
    .map(normalizeFormulaInput)
    .filter((input): input is FormulaInput => input != null);

  if (formulaInputs.length === 0) {
    return {
      variables: {},
      missingVariables: [],
    };
  }

  const inputDefIds = [
    ...new Set(formulaInputs.map((item) => item.measure_def_id)),
  ];

  const inputDefs = await db
    .select({
      id: measureDefinitions.id,
      aggLevelId: measureDefinitions.agg_level_id,
    })
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.id, inputDefIds));

  const aggLevelMap = new Map<number, number | null>(
    inputDefs.map((row) => [row.id, row.aggLevelId]),
  );

  const scopeConditions: Array<
    ReturnType<typeof eq> | ReturnType<typeof isNull>
  > = [
    eq(dataEntries.report_period_id, request.scope.reportPeriodId),
    inArray(dataEntries.measure_def_id, inputDefIds),
    eq(dataEntries.is_deleted, false),
    eq(dataEntries.is_relevant, true),
  ];

  if (request.scope.serviceAreaId == null) {
    scopeConditions.push(isNull(dataEntries.service_area_id));
  } else {
    // Include global rows (null service area) as fallback for utility-level inputs.
    scopeConditions.push(
      or(
        eq(dataEntries.service_area_id, request.scope.serviceAreaId),
        isNull(dataEntries.service_area_id),
      )!,
    );
  }

  if (request.scope.energyResourceId == null) {
    scopeConditions.push(isNull(dataEntries.unit_id));
  } else {
    scopeConditions.push(
      eq(dataEntries.unit_id, request.scope.energyResourceId),
    );
  }

  // customer_type / payment_mode (and the other dimensions) are matched
  // per-input below against the formula_input binding — falling back to the
  // evaluation scope — so they are no longer pre-filtered in SQL here.

  const rows = await db
    .select({
      inputDefId: dataEntries.measure_def_id,
      // Prefer the typed numeric column; fall back to the legacy `value`
      // varchar for rows not yet migrated to value_numeric (§4.8).
      value: sql<
        string | null
      >`coalesce(${dataEntries.value_numeric}::text, ${dataEntries.value})`,
      isDeleted: dataEntries.is_deleted,
      isRelevant: dataEntries.is_relevant,
      energyProviderId: dataEntries.provider_id,
      energySourceId: dataEntries.technology_id,
      energyResourceTypeId: dataEntries.asset_id,
      customerTypeId: dataEntries.customer_type_id,
      paymentModeId: dataEntries.payment_mode_id,
      consumptionBandId: dataEntries.consumption_band_id,
      divisionId: dataEntries.division_id,
      genderId: dataEntries.gender_id,
      utilityFunctionId: dataEntries.utility_function_id,
    })
    .from(dataEntries)
    .where(and(...scopeConditions))
    // Newest first, so the single-value path below deterministically prefers
    // the most recently updated row when a scope holds several copies.
    .orderBy(desc(dataEntries.updatedAt));

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

  for (const formulaInput of formulaInputs) {
    const sourceRows = byInputDef.get(formulaInput.measure_def_id) ?? [];
    const m = (
      actual: number | null,
      bound: number | null | undefined,
      allMember: number,
      scopeValue: number | null = null,
    ) => matchDimension(actual, bound ?? null, scopeValue, allMember);
    const candidates = sourceRows.filter(
      (c) =>
        m(c.energyProviderId, formulaInput.provider_id, ALL_MEMBER.provider_id) &&
        m(c.energyTypeId, formulaInput.category_id, ALL_MEMBER.category_id) &&
        m(c.energySourceId, formulaInput.technology_id, ALL_MEMBER.technology_id) &&
        m(c.energyResourceTypeId, formulaInput.asset_id, ALL_MEMBER.asset_id) &&
        m(c.customerTypeId, formulaInput.customer_type_id, ALL_MEMBER.customer_type_id, request.scope.customerTypeId ?? null) &&
        m(c.paymentModeId, formulaInput.payment_mode_id, ALL_MEMBER.payment_mode_id, request.scope.paymentModeId ?? null) &&
        m(c.consumptionBandId, formulaInput.consumption_band_id, ALL_MEMBER.consumption_band_id) &&
        m(c.divisionId, formulaInput.division_id, ALL_MEMBER.division_id) &&
        m(c.genderId, formulaInput.gender_id, ALL_MEMBER.gender_id) &&
        m(c.utilityFunctionId, formulaInput.utility_function_id, ALL_MEMBER.utility_function_id),
    );
    const inputAggLevelId =
      aggLevelMap.get(formulaInput.measure_def_id) ?? null;

    if (shouldRollup(request.kpiAggLevelId, inputAggLevelId)) {
      const rollup = sumRollupValues(candidates);
      if (!rollup.hasValue) {
        missingVariables.push(formulaInput.variable_name);
        continue;
      }

      variables[formulaInput.variable_name] = rollup.sum;
      continue;
    }

    // A scope can hold several copies of a row (blank placeholders, legacy
    // imports); take the first candidate that actually carries a number
    // rather than failing on a blank one.
    const numeric =
      candidates
        .map((candidate) => asNumber(candidate.value))
        .find((value) => value != null) ?? null;

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
