import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";

export interface AggregatedWorkerScope {
  reportPeriodId: number;
  serviceAreaId?: number | null;
  unitId?: number | null;
}

export interface DimensionedRow {
  value: string | null;
  provider: number | null;
  category: number | null;
  technology: number | null;
  assetClass: number | null;
  customerType: number | null;
  paymentMode: number | null;
  consumptionBand: number | null;
  division: number | null;
  gender: number | null;
  utilityFunction: number | null;
}

const asFiniteNumber = (value: string | null): number | null => {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** True when every dimension is the All-member (or a legacy null). */
const isAllMemberRow = (r: DimensionedRow): boolean =>
  (r.provider == null || r.provider === ALL_MEMBER.provider_id) &&
  (r.category == null || r.category === ALL_MEMBER.category_id) &&
  (r.technology == null || r.technology === ALL_MEMBER.technology_id) &&
  (r.assetClass == null || r.assetClass === ALL_MEMBER.asset_class_id) &&
  (r.customerType == null || r.customerType === ALL_MEMBER.customer_type_id) &&
  (r.paymentMode == null || r.paymentMode === ALL_MEMBER.payment_mode_id) &&
  (r.consumptionBand == null ||
    r.consumptionBand === ALL_MEMBER.consumption_band_id) &&
  (r.division == null || r.division === ALL_MEMBER.division_id) &&
  (r.gender == null || r.gender === ALL_MEMBER.gender_id) &&
  (r.utilityFunction == null ||
    r.utilityFunction === ALL_MEMBER.utility_function_id);

/**
 * Resolve one input measure's rows to a single value with the ruled
 * dimension-rollup preference — "All-row else sum of detail" (mirror of
 * kpi-worker/resolveInputs; #8, grounded in PR #104 + §4.6). The aggregated
 * worker treats every input at its All-member aggregate, so:
 *   1. an authoritative All-member (or legacy-null) row exists → USE it;
 *   2. else the input is stored as member slices → SUM them;
 *   3. else missing.
 * One source is ever consulted, never added across → no double-count.
 */
export const resolveAggregateValue = (
  rows: DimensionedRow[],
): string | null => {
  const authoritative = rows
    .filter(isAllMemberRow)
    .map((r) => asFiniteNumber(r.value))
    .find((v) => v != null);
  if (authoritative != null) return String(authoritative);

  let sum = 0;
  let hasValue = false;
  for (const r of rows) {
    const numeric = asFiniteNumber(r.value);
    if (numeric != null) {
      sum += numeric;
      hasValue = true;
    }
  }
  return hasValue ? String(sum) : null;
};

interface VariableMapping {
  variableToInputDefId: Map<string, number>;
  inputDefIds: number[];
}

export interface SourceSnapshot {
  byVariable: Record<string, string | null>;
  byInputDefId: Record<number, string | null>;
}

export const resolveVariableMappings = async (
  variableNames: string[],
  inputDefIds: number[],
): Promise<VariableMapping> => {
  if (variableNames.length === 0 && inputDefIds.length === 0) {
    return {
      variableToInputDefId: new Map(),
      inputDefIds: [],
    };
  }

  const conditions = [];

  if (variableNames.length > 0) {
    conditions.push(inArray(measureDefinitions.variable_name, variableNames));
  }

  if (inputDefIds.length > 0) {
    conditions.push(inArray(measureDefinitions.id, inputDefIds));
  }

  const rows = await db
    .select({
      inputDefId: measureDefinitions.id,
      variableName: measureDefinitions.variable_name,
    })
    .from(measureDefinitions)
    .where(conditions.length > 1 ? or(...conditions) : conditions[0]);

  const resolvedInputDefIds = new Set<number>(inputDefIds);

  const variableToInputDefId = new Map<string, number>();
  for (const row of rows) {
    resolvedInputDefIds.add(row.inputDefId);

    if (row.variableName) {
      variableToInputDefId.set(row.variableName, row.inputDefId);
    }
  }

  return {
    variableToInputDefId,
    inputDefIds: [...resolvedInputDefIds],
  };
};

export const readSourceSnapshot = async (
  scope: AggregatedWorkerScope,
  variableNames: string[],
  inputDefIds: number[],
): Promise<SourceSnapshot> => {
  const mapping = await resolveVariableMappings(variableNames, inputDefIds);

  if (mapping.inputDefIds.length === 0) {
    return {
      byVariable: {},
      byInputDefId: {},
    };
  }

  const conditions = [
    eq(dataEntries.report_period_id, scope.reportPeriodId),
    inArray(dataEntries.measure_def_id, mapping.inputDefIds),
    eq(dataEntries.is_deleted, false),
  ];

  if (scope.serviceAreaId == null) {
    conditions.push(isNull(dataEntries.service_area_id));
  } else {
    conditions.push(eq(dataEntries.service_area_id, scope.serviceAreaId));
  }

  if (scope.unitId == null) {
    conditions.push(isNull(dataEntries.unit_id));
  } else {
    conditions.push(eq(dataEntries.unit_id, scope.unitId));
  }

  const rows = await db
    .select({
      inputDefId: dataEntries.measure_def_id,
      // Prefer the typed numeric column; fall back to the legacy `value`
      // varchar for rows not yet migrated to value_numeric (§4.8).
      value: sql<
        string | null
      >`coalesce(${dataEntries.value_numeric}::text, ${dataEntries.value})`,
      provider: dataEntries.provider_id,
      category: dataEntries.category_id,
      technology: dataEntries.technology_id,
      assetClass: dataEntries.asset_class_id,
      customerType: dataEntries.customer_type_id,
      paymentMode: dataEntries.payment_mode_id,
      consumptionBand: dataEntries.consumption_band_id,
      division: dataEntries.division_id,
      gender: dataEntries.gender_id,
      utilityFunction: dataEntries.utility_function_id,
    })
    .from(dataEntries)
    .where(and(...conditions));

  // Group each input measure's rows, then resolve to one value via the
  // "All-row else sum of detail" rule so a slice-only input sums to its total
  // instead of collapsing to one arbitrary slice (last-wins).
  const rowsByInputDef = new Map<number, DimensionedRow[]>();
  for (const row of rows) {
    const bucket = rowsByInputDef.get(row.inputDefId) ?? [];
    bucket.push(row);
    rowsByInputDef.set(row.inputDefId, bucket);
  }

  const byInputDefId: Record<number, string | null> = {};
  for (const [inputDefId, groupRows] of rowsByInputDef) {
    byInputDefId[inputDefId] = resolveAggregateValue(groupRows);
  }

  const byVariable: Record<string, string | null> = {};
  for (const variableName of variableNames) {
    const mappedInputDefId = mapping.variableToInputDefId.get(variableName);
    if (mappedInputDefId == null) {
      continue;
    }

    byVariable[variableName] = byInputDefId[mappedInputDefId] ?? null;
  }

  return {
    byVariable,
    byInputDefId,
  };
};
