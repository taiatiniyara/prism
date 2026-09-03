"use server";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import {
  dataEntries,
  measureDefinitions,
  type FormulaInput,
} from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations, units, powerStations } from "@/db/schema/utility";
import { loadFormulaInputsFromBindings } from "@/app/data-entry/kpi-worker/formula-bindings";

// ---------------------------------------------------------------------------
// Input coverage diagnostic
//
// When a calculated measure / KPI can't compute, the failure only says WHICH
// input variables were missing (e.g. "rated_capacity, downtime_planned_duration")
// — never which specific generators (units) lack the data, because the fact
// resolver rolls every unit's rows up into one aggregate and only flags an input
// "missing" when that aggregate is null (no unit at all has a value). It also
// can't warn when SOME units are blank: the aggregate still computes, silently,
// off partial data.
//
// This read-only diagnostic answers "which units are missing which input" for a
// given (owner × report period): for every input measure it lists, at unit
// grain, which generators have a value entered and which are blank. The expected
// roster is the relevant `data_entries` rows the resolver itself reads
// (`is_relevant = true`, `is_deleted = false`) — a unit with a relevant shell but
// no value is "missing"; a unit with a value is "entered". A report period is
// utility-specific (report_periods.utility_id), so filtering by it scopes to the
// one utility automatically.
// ---------------------------------------------------------------------------

export interface CoverageUnit {
  unitId: number;
  unitName: string;
  stationName: string | null;
}

export interface InputCoverage {
  /** the formula variable name(s) bound to this input measure */
  variableNames: string[];
  measureDefId: number;
  measureName: string;
  /** true when the measure has unit-grain rows this period */
  perUnit: boolean;
  /** expected units = distinct units with a relevant row for this measure/period */
  totalUnits: number;
  enteredUnits: CoverageUnit[];
  missingUnits: CoverageUnit[];
  /** any row (unit or coarser grain) carries a value — used for non-unit inputs */
  aggregatePresent: boolean;
}

export interface PeriodInputCoverage {
  reportPeriodId: number;
  utilityName: string | null;
  ownerName: string;
  inputs: InputCoverage[];
}

/** measure_def_ids + variable names a formula_inputs JSON cache references. */
function inputsFromJson(
  formulaInputs: FormulaInput[] | null | undefined,
): Array<{ measure_def_id: number; variable_name: string }> {
  return (formulaInputs ?? [])
    .map((fi) => {
      const raw = fi as FormulaInput & {
        measure_def_id?: unknown;
        input_def_id?: unknown;
        variable_name?: unknown;
      };
      const id = raw.measure_def_id ?? raw.input_def_id;
      return typeof id === "number"
        ? {
            measure_def_id: id,
            variable_name:
              typeof raw.variable_name === "string" ? raw.variable_name : "",
          }
        : null;
    })
    .filter((x): x is { measure_def_id: number; variable_name: string } => x != null);
}

export async function getPeriodInputCoverage(args: {
  ownerKind: "kpi" | "measure";
  ownerId: number;
  reportPeriodId: number;
}): Promise<PeriodInputCoverage> {
  const { ownerKind, ownerId, reportPeriodId } = args;

  // --- owner name + fallback inputs (formula_inputs JSON) ---
  let ownerName: string;
  let jsonInputs: Array<{ measure_def_id: number; variable_name: string }> = [];
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

  // --- inputs: formula_binding is source of truth, fall back to JSON ---
  const bound = (
    await loadFormulaInputsFromBindings(ownerKind, [ownerId])
  ).get(ownerId);
  const rawInputs = (bound && bound.length ? bound : jsonInputs).map((i) => ({
    measure_def_id: i.measure_def_id,
    variable_name: i.variable_name,
  }));

  // Group by measure (one card per distinct input measure, collecting the
  // variable name(s) that reference it) — coverage is a per-measure fact.
  const variablesByMeasure = new Map<number, string[]>();
  const measureOrder: number[] = [];
  for (const i of rawInputs) {
    if (!variablesByMeasure.has(i.measure_def_id)) {
      variablesByMeasure.set(i.measure_def_id, []);
      measureOrder.push(i.measure_def_id);
    }
    if (i.variable_name)
      variablesByMeasure.get(i.measure_def_id)!.push(i.variable_name);
  }
  const measureIds = measureOrder;

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

  if (measureIds.length === 0) {
    return { reportPeriodId, utilityName, ownerName, inputs: [] };
  }

  // measure names
  const measRows = await db
    .select({ id: measureDefinitions.id, name: measureDefinitions.name })
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.id, measureIds));
  const measureName = new Map(measRows.map((r) => [r.id, r.name]));

  // relevant, non-deleted data_entries rows for these measures this period
  // (exactly what the fact resolver reads), tagged with unit + value presence
  const entryRows = await db
    .select({
      measureDefId: dataEntries.measure_def_id,
      unitId: dataEntries.unit_id,
      value: sql<
        string | null
      >`coalesce(${dataEntries.value_numeric}::text, ${dataEntries.value})`,
    })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.report_period_id, reportPeriodId),
        inArray(dataEntries.measure_def_id, measureIds),
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
      ),
    );

  // unit names (+ station) for every unit referenced
  const unitIds = [
    ...new Set(
      entryRows
        .map((r) => r.unitId)
        .filter((id): id is number => id != null),
    ),
  ];
  const unitRows = unitIds.length
    ? await db
        .select({
          id: units.id,
          name: units.name,
          stationName: powerStations.name,
        })
        .from(units)
        .leftJoin(powerStations, eq(units.power_station_id, powerStations.id))
        .where(inArray(units.id, unitIds))
        .orderBy(units.name)
    : [];
  const unitInfo = new Map(
    unitRows.map((u) => [u.id, { name: u.name, stationName: u.stationName ?? null }]),
  );

  const hasValue = (v: string | null): boolean => v != null && v !== "";

  const rowsByMeasure = new Map<number, typeof entryRows>();
  for (const r of entryRows) {
    const bucket = rowsByMeasure.get(r.measureDefId) ?? [];
    bucket.push(r);
    rowsByMeasure.set(r.measureDefId, bucket);
  }

  const inputs: InputCoverage[] = measureIds.map((mid) => {
    const rows = rowsByMeasure.get(mid) ?? [];
    const unitRowsForM = rows.filter((r) => r.unitId != null);
    const perUnit = unitRowsForM.length > 0;

    // A unit is "entered" if ANY of its rows for this measure carries a value
    // (a unit can have several dimension-sliced rows in one period).
    const byUnit = new Map<number, boolean>();
    for (const r of unitRowsForM) {
      const uid = r.unitId as number;
      byUnit.set(uid, (byUnit.get(uid) ?? false) || hasValue(r.value));
    }

    const enteredUnits: CoverageUnit[] = [];
    const missingUnits: CoverageUnit[] = [];
    for (const [uid, entered] of byUnit) {
      const info = unitInfo.get(uid);
      const unit: CoverageUnit = {
        unitId: uid,
        unitName: info?.name ?? `Unit ${uid}`,
        stationName: info?.stationName ?? null,
      };
      (entered ? enteredUnits : missingUnits).push(unit);
    }
    const byName = (a: CoverageUnit, b: CoverageUnit) =>
      a.unitName.localeCompare(b.unitName);
    enteredUnits.sort(byName);
    missingUnits.sort(byName);

    return {
      variableNames: variablesByMeasure.get(mid) ?? [],
      measureDefId: mid,
      measureName: measureName.get(mid) ?? `Measure ${mid}`,
      perUnit,
      totalUnits: byUnit.size,
      enteredUnits,
      missingUnits,
      aggregatePresent: rows.some((r) => hasValue(r.value)),
    };
  });

  return { reportPeriodId, utilityName, ownerName, inputs };
}
