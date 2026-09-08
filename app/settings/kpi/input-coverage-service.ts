"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import {
  dataEntries,
  measureDefinitions,
  type FormulaInput,
} from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";
import { managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations, units, powerStations } from "@/db/schema/utility";
import { loadFormulaInputsFromBindings } from "@/app/data-entry/kpi-worker/formula-bindings";
import {
  candidateInBindingScope,
  type RollupCandidate,
} from "@/app/data-entry/kpi-worker/dimension-rollup";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";

// ---------------------------------------------------------------------------
// Input coverage diagnostic
//
// When a calculated measure / KPI can't compute, the failure only says WHICH
// input variables were missing — never which specific generators (units) lack
// the data, because the fact resolver rolls every unit's rows up into one
// aggregate and only flags an input "missing" when that aggregate is null. It
// also can't warn when SOME units are blank: the aggregate still computes,
// silently, off partial data.
//
// This read-only diagnostic answers "which units are missing which input" for a
// given (owner × report period), at unit grain, per BOUND VARIABLE — filtered to
// exactly the dimension slice that variable resolves over (via the resolver's
// own `candidateInBindingScope`), so two variables that bind the same measure at
// different slices get their own coverage picture instead of one lumped card.
// ---------------------------------------------------------------------------

export interface CoverageUnit {
  unitId: number;
  unitName: string;
  stationName: string | null;
}

export interface InputCoverage {
  /** the formula variable name(s) sharing this measure + dimension slice */
  variableNames: string[];
  measureDefId: number;
  measureName: string;
  /** true when the binding pins at least one dimension (a real slice, not All) */
  sliced: boolean;
  /** true when the measure has unit-grain rows in this slice this period */
  perUnit: boolean;
  /** expected units = distinct units with a relevant row in this slice/period */
  totalUnits: number;
  enteredUnits: CoverageUnit[];
  missingUnits: CoverageUnit[];
  /** any row (unit or coarser grain) in this slice carries a value */
  aggregatePresent: boolean;
}

export interface PeriodInputCoverage {
  reportPeriodId: number;
  utilityName: string | null;
  ownerName: string;
  inputs: InputCoverage[];
}

/** Compact per-period coverage totals for an inline badge in the reason table. */
export interface PeriodCoverageSummary {
  reportPeriodId: number;
  /** distinct units missing ≥1 per-unit input this period */
  missingUnits: number;
  /** distinct units expected across all per-unit inputs this period */
  totalUnits: number;
  /** number of inputs tracked at unit grain (0 ⇒ nothing to badge) */
  perUnitInputs: number;
}

const DIM_KEYS = [
  "provider_id",
  "category_id",
  "technology_id",
  "asset_class_id",
  "customer_type_id",
  "payment_mode_id",
  "consumption_band_id",
  "division_id",
  "gender_id",
  "utility_function_id",
] as const;

/** A binding with every dimension defaulted to its All member (JSON fallback). */
function allMemberBinding(measure_def_id: number, variable_name: string): FormulaInput {
  const fi: Record<string, number | string> = { measure_def_id, variable_name };
  for (const key of DIM_KEYS) fi[key] = ALL_MEMBER[key as keyof typeof ALL_MEMBER];
  return fi as unknown as FormulaInput;
}

/** measure_def_ids + variable names a formula_inputs JSON cache references. */
function inputsFromJson(
  formulaInputs: FormulaInput[] | null | undefined,
): FormulaInput[] {
  return (formulaInputs ?? [])
    .map((fi) => {
      const raw = fi as FormulaInput & {
        measure_def_id?: unknown;
        input_def_id?: unknown;
        variable_name?: unknown;
      };
      const id = raw.measure_def_id ?? raw.input_def_id;
      if (typeof id !== "number") return null;
      return allMemberBinding(
        id,
        typeof raw.variable_name === "string" ? raw.variable_name : "",
      );
    })
    .filter((x): x is FormulaInput => x != null);
}

/** Owner name + bound inputs (formula_binding source of truth, JSON fallback). */
async function loadOwnerInputs(
  ownerKind: "kpi" | "measure",
  ownerId: number,
): Promise<{ ownerName: string; bindings: FormulaInput[] }> {
  let ownerName: string;
  let jsonInputs: FormulaInput[] = [];
  if (ownerKind === "measure") {
    const [m] = await db
      .select({
        name: measureDefinitions.name,
        formula_inputs: measureDefinitions.formula_inputs,
      })
      .from(measureDefinitions)
      .where(eq(measureDefinitions.id, ownerId))
      .limit(1);
    ownerName = m?.name ?? `Measure ${ownerId}`;
    jsonInputs = inputsFromJson(m?.formula_inputs);
  } else {
    const [k] = await db
      .select({
        name: kpiDefinitions.name,
        formula_inputs: kpiDefinitions.formula_inputs,
      })
      .from(kpiDefinitions)
      .where(eq(kpiDefinitions.id, ownerId))
      .limit(1);
    ownerName = k?.name ?? `KPI ${ownerId}`;
    jsonInputs = inputsFromJson(k?.formula_inputs);
  }
  const bound = (await loadFormulaInputsFromBindings(ownerKind, [ownerId])).get(
    ownerId,
  );
  return {
    ownerName,
    bindings: bound && bound.length ? bound : jsonInputs,
  };
}

/**
 * Relevant, non-deleted `data_entries` for these measures across the given
 * periods, shaped as `RollupCandidate` (+ period id) so `candidateInBindingScope`
 * — the resolver's own slice matcher — filters them. Batched over periods so one
 * query serves both the single-period modal and the multi-period summary.
 * NB mirrors `DbFactSource.dimensionedRows`' shaping (incl. technology→category
 * parent derivation); keep the two in step.
 */
type CoverageRow = RollupCandidate & {
  reportPeriodId: number;
  measureDefId: number;
};

async function fetchCoverageRows(
  reportPeriodIds: number[],
  measureIds: number[],
): Promise<Map<number, CoverageRow[]>> {
  const byPeriod = new Map<number, CoverageRow[]>();
  if (reportPeriodIds.length === 0 || measureIds.length === 0) return byPeriod;

  const rows = await db
    .select({
      reportPeriodId: dataEntries.report_period_id,
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
      measureDefId: dataEntries.measure_def_id,
    })
    .from(dataEntries)
    .where(
      and(
        inArray(dataEntries.report_period_id, reportPeriodIds),
        inArray(dataEntries.measure_def_id, measureIds),
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
      ),
    )
    .orderBy(desc(dataEntries.updatedAt));

  const technologyIds = [
    ...new Set(
      rows
        .map((r) => r.energySourceId)
        .filter((id): id is number => id != null),
    ),
  ];
  const parents = technologyIds.length
    ? await db
        .select({
          id: managedListItems.id,
          parentId: managedListItems.parent_id,
        })
        .from(managedListItems)
        .where(inArray(managedListItems.id, technologyIds))
    : [];
  const categoryByTech = new Map<number, number | null>(
    parents.map((p) => [p.id, p.parentId ?? null]),
  );

  for (const r of rows) {
    const shaped: CoverageRow = {
      reportPeriodId: r.reportPeriodId,
      measureDefId: r.measureDefId,
      value: r.value,
      isDeleted: r.isDeleted,
      isRelevant: r.isRelevant,
      energyProviderId: r.energyProviderId,
      energyTypeId:
        r.energySourceId != null
          ? (categoryByTech.get(r.energySourceId) ?? null)
          : null,
      energySourceId: r.energySourceId,
      unitTypeId: r.unitTypeId,
      customerTypeId: r.customerTypeId,
      paymentModeId: r.paymentModeId,
      consumptionBandId: r.consumptionBandId,
      divisionId: r.divisionId,
      genderId: r.genderId,
      utilityFunctionId: r.utilityFunctionId,
      grainAreaId: r.grainAreaId,
      grainStationId: r.grainStationId,
      grainUnitId: r.grainUnitId,
    };
    const bucket = byPeriod.get(r.reportPeriodId) ?? [];
    bucket.push(shaped);
    byPeriod.set(r.reportPeriodId, bucket);
  }
  return byPeriod;
}

/** Group bindings by measure + dimension signature — one card per distinct
 *  slice, collecting the variable names that share it. */
interface BindingGroup {
  measureDefId: number;
  variableNames: string[];
  binding: FormulaInput;
  sliced: boolean;
}
function groupBindings(bindings: FormulaInput[]): BindingGroup[] {
  const groups = new Map<string, BindingGroup>();
  const order: string[] = [];
  for (const b of bindings) {
    const dims = DIM_KEYS.map(
      (k) => (b as unknown as Record<string, number | null>)[k] ?? "∅",
    );
    const sig = `${b.measure_def_id}|${dims.join("|")}`;
    if (!groups.has(sig)) {
      const sliced = DIM_KEYS.some(
        (k) =>
          (b as unknown as Record<string, number | null>)[k] !==
          ALL_MEMBER[k as keyof typeof ALL_MEMBER],
      );
      groups.set(sig, {
        measureDefId: b.measure_def_id,
        variableNames: [],
        binding: b,
        sliced,
      });
      order.push(sig);
    }
    if (b.variable_name) groups.get(sig)!.variableNames.push(b.variable_name);
  }
  return order.map((sig) => groups.get(sig)!);
}

const hasValue = (v: string | null): boolean => v != null && v !== "";

/** Per-unit coverage of one binding group over its period's rows (sliced). */
function coverageForGroup(
  group: BindingGroup,
  rows: CoverageRow[],
): { entered: Set<number>; missing: Set<number>; aggregatePresent: boolean } {
  const inScope = rows.filter(
    (r) =>
      r.measureDefId === group.measureDefId &&
      candidateInBindingScope(r, group.binding),
  );
  const byUnit = new Map<number, boolean>();
  for (const r of inScope) {
    if (r.grainUnitId == null) continue;
    byUnit.set(
      r.grainUnitId,
      (byUnit.get(r.grainUnitId) ?? false) || hasValue(r.value),
    );
  }
  const entered = new Set<number>();
  const missing = new Set<number>();
  for (const [uid, has] of byUnit) (has ? entered : missing).add(uid);
  return {
    entered,
    missing,
    aggregatePresent: inScope.some((r) => hasValue(r.value)),
  };
}

async function unitNames(
  unitIds: number[],
): Promise<Map<number, { name: string; stationName: string | null }>> {
  if (unitIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: units.id,
      name: units.name,
      stationName: powerStations.name,
    })
    .from(units)
    .leftJoin(powerStations, eq(units.power_station_id, powerStations.id))
    .where(inArray(units.id, unitIds))
    .orderBy(units.name);
  return new Map(
    rows.map((u) => [u.id, { name: u.name, stationName: u.stationName ?? null }]),
  );
}

export async function getPeriodInputCoverage(args: {
  ownerKind: "kpi" | "measure";
  ownerId: number;
  reportPeriodId: number;
}): Promise<PeriodInputCoverage> {
  const { ownerKind, ownerId, reportPeriodId } = args;
  const { ownerName, bindings } = await loadOwnerInputs(ownerKind, ownerId);

  // utility name via the report period (period → one utility)
  const [rp] = await db
    .select({ utilityId: reportPeriods.utility_id })
    .from(reportPeriods)
    .where(eq(reportPeriods.id, reportPeriodId))
    .limit(1);
  let utilityName: string | null = null;
  if (rp) {
    const [util] = await db
      .select({ name: organisations.name })
      .from(organisations)
      .where(eq(organisations.id, rp.utilityId))
      .limit(1);
    utilityName = util?.name ?? null;
  }

  const groups = groupBindings(bindings);
  if (groups.length === 0) {
    return { reportPeriodId, utilityName, ownerName, inputs: [] };
  }

  const measureIds = [...new Set(groups.map((g) => g.measureDefId))];
  const measRows = await db
    .select({ id: measureDefinitions.id, name: measureDefinitions.name })
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.id, measureIds));
  const measureName = new Map(measRows.map((r) => [r.id, r.name]));

  const rows = (await fetchCoverageRows([reportPeriodId], measureIds)).get(
    reportPeriodId,
  ) ?? [];

  // one pass to collect the units, then names
  const cov = groups.map((g) => ({ g, c: coverageForGroup(g, rows) }));
  const allUnitIds = [
    ...new Set(cov.flatMap(({ c }) => [...c.entered, ...c.missing])),
  ];
  const names = await unitNames(allUnitIds);
  const toUnit = (uid: number): CoverageUnit => ({
    unitId: uid,
    unitName: names.get(uid)?.name ?? `Unit ${uid}`,
    stationName: names.get(uid)?.stationName ?? null,
  });
  const byName = (a: CoverageUnit, b: CoverageUnit) =>
    a.unitName.localeCompare(b.unitName);

  const inputs: InputCoverage[] = cov.map(({ g, c }) => {
    const perUnit = c.entered.size + c.missing.size > 0;
    return {
      variableNames: g.variableNames,
      measureDefId: g.measureDefId,
      measureName: measureName.get(g.measureDefId) ?? `Measure ${g.measureDefId}`,
      sliced: g.sliced,
      perUnit,
      totalUnits: c.entered.size + c.missing.size,
      enteredUnits: [...c.entered].map(toUnit).sort(byName),
      missingUnits: [...c.missing].map(toUnit).sort(byName),
      aggregatePresent: c.aggregatePresent,
    };
  });

  return { reportPeriodId, utilityName, ownerName, inputs };
}

/**
 * Compact coverage totals for many periods at once (one batched query) — drives
 * the inline "N units blank" badge in the recompute reason table without opening
 * the modal. `missingUnits` = distinct units missing ≥1 per-unit input.
 */
export async function getPeriodsCoverageSummary(args: {
  ownerKind: "kpi" | "measure";
  ownerId: number;
  reportPeriodIds: number[];
}): Promise<PeriodCoverageSummary[]> {
  const { ownerKind, ownerId, reportPeriodIds } = args;
  if (reportPeriodIds.length === 0) return [];
  const { bindings } = await loadOwnerInputs(ownerKind, ownerId);
  const groups = groupBindings(bindings);
  if (groups.length === 0) {
    return reportPeriodIds.map((reportPeriodId) => ({
      reportPeriodId,
      missingUnits: 0,
      totalUnits: 0,
      perUnitInputs: 0,
    }));
  }
  const measureIds = [...new Set(groups.map((g) => g.measureDefId))];
  const rowsByPeriod = await fetchCoverageRows(reportPeriodIds, measureIds);

  return reportPeriodIds.map((reportPeriodId) => {
    const rows = rowsByPeriod.get(reportPeriodId) ?? [];
    const missing = new Set<number>();
    const total = new Set<number>();
    let perUnitInputs = 0;
    for (const g of groups) {
      const c = coverageForGroup(g, rows);
      if (c.entered.size + c.missing.size > 0) perUnitInputs += 1;
      for (const u of c.missing) missing.add(u);
      for (const u of c.entered) total.add(u);
      for (const u of c.missing) total.add(u);
    }
    return {
      reportPeriodId,
      missingUnits: missing.size,
      totalUnits: total.size,
      perUnitInputs,
    };
  });
}
