import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import type { FormulaInput } from "@/db/schema/dataEntry";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { managedListItems } from "@/db/schema/managedLists";
import { countryContext } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";

import {
  asNumber,
  pickInputValue,
  selectGrainCandidates,
  strataShouldRollup,
} from "./dimension-rollup";
import type { RollupCandidate } from "./dimension-rollup";
import { normalizeFormulaInput } from "./normalizeFormulaInput";
import type { KpiWorkerScope } from "./types";

export type { RollupCandidate } from "./dimension-rollup";
export { sumRollupValues } from "./dimension-rollup";

export interface ResolveInputsRequest {
  formulaInputs: FormulaInput[];
  kpiAggLevelId: number | null;
  scope: KpiWorkerScope;
}

export interface ResolvedFormulaInputs {
  variables: Record<string, number>;
  missingVariables: string[];
}

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
      isContextFed: measureDefinitions.is_context_fed,
    })
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.id, inputDefIds));

  const strataMap = new Map<number, number | null>(
    inputDefs.map((row) => [row.id, row.strataId]),
  );

  const contextFedIds = new Set<number>(
    inputDefs.filter((row) => row.isContextFed).map((row) => row.id),
  );

  // Context-fed inputs (measure_definitions.is_context_fed) are NATIONAL
  // reference figures kept in country_context (country × metric × source_date),
  // never in data_entries. Resolve them the way the Power BI bridge does
  // (lib/legacy/context-data.ts): map the period → its utility's country, then
  // carry forward the latest source_date at or before the period's report_date
  // (as-of rule). These figures are dimensionless, so no dimension/grain match
  // applies — every utility in a country resolves to the same national value.
  const contextValueByDef = new Map<number, number | null>();
  if (contextFedIds.size > 0) {
    const [rp] = await db
      .select({
        utilityId: reportPeriods.utility_id,
        reportDate: reportPeriods.report_date,
      })
      .from(reportPeriods)
      .where(eq(reportPeriods.id, request.scope.reportPeriodId))
      .limit(1);

    const [org] = rp
      ? await db
          .select({ countryId: organisations.country_id })
          .from(organisations)
          .where(eq(organisations.id, rp.utilityId))
          .limit(1)
      : [];

    const countryId = org?.countryId ?? null;
    if (rp && countryId != null) {
      const reportTime = rp.reportDate.getTime();
      const ctxRows = await db
        .select({
          measureId: countryContext.measure_def_id,
          sourceDate: countryContext.source_date,
          value: countryContext.value,
          noDataReason: countryContext.no_data_reason,
        })
        .from(countryContext)
        .where(
          and(
            eq(countryContext.country_id, countryId),
            inArray(countryContext.measure_def_id, [...contextFedIds]),
          ),
        );

      // Carry-forward: latest source_date at or before the report date, per metric.
      const best = new Map<
        number,
        { time: number; value: string | null; noData: string | null }
      >();
      for (const row of ctxRows) {
        const time = row.sourceDate.getTime();
        if (time > reportTime) continue;
        const cur = best.get(row.measureId);
        if (!cur || time > cur.time) {
          best.set(row.measureId, {
            time,
            value: row.value,
            noData: row.noDataReason,
          });
        }
      }
      for (const [measureId, pick] of best) {
        contextValueByDef.set(
          measureId,
          pick.noData ? null : asNumber(pick.value),
        );
      }
    }
  }

  // Only non-context inputs are read from the dimensioned data_entries table.
  const regularInputDefIds = inputDefIds.filter(
    (id) => !contextFedIds.has(id),
  );

  const scopeConditions: Array<
    ReturnType<typeof eq> | ReturnType<typeof isNull>
  > = [
    eq(dataEntries.report_period_id, request.scope.reportPeriodId),
    inArray(dataEntries.measure_def_id, regularInputDefIds),
    eq(dataEntries.is_deleted, false),
    eq(dataEntries.is_relevant, true),
  ];

  // Grain axis (sub-utility chain: unit → power station → service area →
  // utility). The KPI target grain is set by the scope: a pinned unit or
  // service area targets that level; otherwise the target is the utility, and we
  // roll the sub-utility rows up to it in JS below (§4.6 grain rollup, ruled by
  // #8 + #4: prefer the authoritative target-level row, else Σ the coarsest
  // single level present below target — never mixing levels). For the utility
  // target we therefore fetch ALL sub-utility rows here (no null-only filter)
  // and pick the grain level per input; the pinned-scope cases keep their exact
  // filters so their behaviour is unchanged.
  const rollUpGrain =
    request.scope.serviceAreaId == null && request.scope.unitId == null;

  if (request.scope.serviceAreaId != null) {
    // Include global rows (null service area) as fallback for utility-level inputs.
    scopeConditions.push(
      or(
        eq(dataEntries.service_area_id, request.scope.serviceAreaId),
        isNull(dataEntries.service_area_id),
      )!,
    );
  }

  if (request.scope.unitId != null) {
    scopeConditions.push(eq(dataEntries.unit_id, request.scope.unitId));
  }

  // customer_type / payment_mode (and the other dimensions) are matched
  // per-input below against the formula_input binding — falling back to the
  // evaluation scope — so they are no longer pre-filtered in SQL here.

  const rows =
    regularInputDefIds.length === 0
      ? []
      : await db
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
            grainAreaId: dataEntries.service_area_id,
            grainStationId: dataEntries.power_station_id,
            grainUnitId: dataEntries.unit_id,
          })
          .from(dataEntries)
          .where(and(...scopeConditions))
          // Newest first, so the single-value path below deterministically
          // prefers the most recently updated row when a scope holds copies.
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
    // Context-fed inputs resolve from country_context (the national figure for
    // the period's country), not from the dimensioned data_entries rows above.
    if (contextFedIds.has(formulaInput.measure_def_id)) {
      const contextValue =
        contextValueByDef.get(formulaInput.measure_def_id) ?? null;
      if (contextValue == null) {
        missingVariables.push(formulaInput.variable_name);
        continue;
      }
      variables[formulaInput.variable_name] = contextValue;
      continue;
    }

    const sourceRows = byInputDef.get(formulaInput.measure_def_id) ?? [];
    const inputAggLevelId =
      strataMap.get(formulaInput.measure_def_id) ?? null;
    const strataRollup = strataShouldRollup(
      request.kpiAggLevelId,
      inputAggLevelId,
    );

    // Grain rollup (sub-utility chain): prefer the authoritative utility-level
    // row, else Σ the coarsest single level present below target.
    const grain = selectGrainCandidates(sourceRows, rollUpGrain);
    if (grain.mixedLevels.length > 0) {
      console.warn(
        `[kpi-worker] measure ${formulaInput.measure_def_id} period ${request.scope.reportPeriodId}: mixed grain levels ${grain.mixedLevels.join(",")} — rolled up coarsest only`,
      );
    }

    // Any grain rollup implies summing across grain cells; the strata rollup
    // keeps its prior behaviour. (§4.6 additivity — formula inputs are additive
    // bases; ratios are formed at the formula step, never summed.)
    const grainRollup = strataRollup || grain.summed;

    const value = pickInputValue({
      candidateRows: grain.candidates,
      binding: formulaInput,
      scope: {
        customerTypeId: request.scope.customerTypeId ?? null,
        paymentModeId: request.scope.paymentModeId ?? null,
      },
      grainRollup,
    });

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
