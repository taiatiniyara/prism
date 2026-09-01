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
  unitTypeId: number | null;
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
      strataId: measureDefinitions.strata_id,
    })
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.id, inputDefIds));

  const strataMap = new Map<number, number | null>(
    inputDefs.map((row) => [row.id, row.strataId]),
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

  if (request.scope.unitId == null) {
    scopeConditions.push(isNull(dataEntries.unit_id));
  } else {
    scopeConditions.push(
      eq(dataEntries.unit_id, request.scope.unitId),
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
      unitTypeId: dataEntries.asset_class_id,
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

  // strict: authoritative match — an All-binding matches the All-member (or
  // legacy null) aggregate row only.
  const strict = (
    actual: number | null,
    bound: number | null | undefined,
    allMember: number,
    scopeValue: number | null = null,
  ) => matchDimension(actual, bound ?? null, scopeValue, allMember);

  // detail: an All-binding (with no pinning scope value) matches ANY member on
  // that dimension — the member slices as well as All-member/null on the dims
  // that aren't broken down — so the sum is the dimension rollup across all
  // present members. Reached ONLY when no authoritative All-member aggregate
  // row was found (rule 1), so this never adds a full aggregate to its own
  // detail. (Partial-aggregate-plus-detail coexistence is caught by #4's
  // Σ-members-vs-All verifier, not resolved here.)
  const detail = (
    actual: number | null,
    bound: number | null | undefined,
    allMember: number,
    scopeValue: number | null = null,
  ) => {
    if (scopeValue == null && bound != null && bound === allMember) {
      return true;
    }
    return matchDimension(actual, bound ?? null, scopeValue, allMember);
  };

  type SourceRow = (typeof byInputDef extends Map<number, infer V>
    ? V
    : never)[number];

  const matchesAll = (
    c: SourceRow,
    formulaInput: FormulaInput,
    match: typeof strict,
  ): boolean =>
    match(c.energyProviderId, formulaInput.provider_id, ALL_MEMBER.provider_id) &&
    match(c.energyTypeId, formulaInput.category_id, ALL_MEMBER.category_id) &&
    match(c.energySourceId, formulaInput.technology_id, ALL_MEMBER.technology_id) &&
    match(c.unitTypeId, formulaInput.asset_class_id, ALL_MEMBER.asset_class_id) &&
    match(c.customerTypeId, formulaInput.customer_type_id, ALL_MEMBER.customer_type_id, request.scope.customerTypeId ?? null) &&
    match(c.paymentModeId, formulaInput.payment_mode_id, ALL_MEMBER.payment_mode_id, request.scope.paymentModeId ?? null) &&
    match(c.consumptionBandId, formulaInput.consumption_band_id, ALL_MEMBER.consumption_band_id) &&
    match(c.divisionId, formulaInput.division_id, ALL_MEMBER.division_id) &&
    match(c.genderId, formulaInput.gender_id, ALL_MEMBER.gender_id) &&
    match(c.utilityFunctionId, formulaInput.utility_function_id, ALL_MEMBER.utility_function_id);

  for (const formulaInput of formulaInputs) {
    const sourceRows = byInputDef.get(formulaInput.measure_def_id) ?? [];
    const inputAggLevelId =
      strataMap.get(formulaInput.measure_def_id) ?? null;
    const grainRollup = shouldRollup(request.kpiAggLevelId, inputAggLevelId);

    // Dimension resolution follows the ruled "All-row else sum of detail"
    // preference (#8, grounded in PR #104 aggregate-vs-breakdown + §4.6):
    //   1. authoritative All-member aggregate row exists → USE it
    //   2. else genuine member slices exist → SUM them (dimension rollup)
    //   3. else missing.
    // One source is ever consulted, never added across, so a mandatory All row
    // coexisting with an optional (possibly partial) breakdown never
    // double-counts or gets understated by a partial sum.
    let value: number | null = null;

    // Rule 1 — authoritative aggregate (preserves prior grain-rollup behaviour).
    const strictCandidates = sourceRows.filter((c) =>
      matchesAll(c, formulaInput, strict),
    );
    if (grainRollup) {
      const rollup = sumRollupValues(strictCandidates);
      if (rollup.hasValue) value = rollup.sum;
    } else {
      // A scope can hold several copies of a row (blank placeholders, legacy
      // imports); take the first that actually carries a number.
      value =
        strictCandidates
          .map((candidate) => asNumber(candidate.value))
          .find((v) => v != null) ?? null;
    }

    // Rule 2 — no aggregate row: dimension rollup = sum the detail slices.
    if (value == null) {
      const detailCandidates = sourceRows.filter((c) =>
        matchesAll(c, formulaInput, detail),
      );
      const rollup = sumRollupValues(detailCandidates);
      if (rollup.hasValue) value = rollup.sum;
    }

    // Rule 3 — missing.
    if (value == null) {
      missingVariables.push(formulaInput.variable_name);
      continue;
    }

    variables[formulaInput.variable_name] = value;
  }

  return {
    variables,
    missingVariables,
  };
};
