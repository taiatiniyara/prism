import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import {
  allMemberBinding,
  pickInputValue,
  type RollupCandidate,
} from "@/app/data-entry/kpi-worker/dimension-rollup";

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

const toRollupCandidate = (r: DimensionedRow): RollupCandidate => ({
  value: r.value,
  // the SQL query already filters is_deleted; the aggregated worker has no
  // relevance / grain axis, so neutral values here.
  isDeleted: false,
  isRelevant: true,
  energyProviderId: r.provider,
  energyTypeId: r.category,
  energySourceId: r.technology,
  unitTypeId: r.assetClass,
  customerTypeId: r.customerType,
  paymentModeId: r.paymentMode,
  consumptionBandId: r.consumptionBand,
  divisionId: r.division,
  genderId: r.gender,
  utilityFunctionId: r.utilityFunction,
  grainAreaId: null,
  grainStationId: null,
  grainUnitId: null,
});

/**
 * Resolve one input measure's rows to a single value at its All-member
 * aggregate — "All-row else sum of detail" (§4.6, #8, PR #104). Delegates to
 * the shared rule engine (`kpi-worker/dimension-rollup`) with an all-All
 * binding, so the aggregated worker and the KPI worker apply the identical
 * preference instead of two copies that can drift.
 */
export const resolveAggregateValue = (
  rows: DimensionedRow[],
): string | null => {
  const value = pickInputValue({
    candidateRows: rows.map(toRollupCandidate),
    binding: allMemberBinding(0),
    scope: {},
    grainRollup: false,
  });
  return value == null ? null : String(value);
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
