import { db } from "@/db/connection";
import {
  dataEntries,
  DataEntryStatusId,
  measureDefinitions,
} from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { and, eq } from "drizzle-orm";

import {
  isBenchmarkingPeriod,
  listBenchmarkingPeriodIds,
} from "@/lib/benchmarking/participation";

const HOURS_IN_PERIOD_MEASURE_NAME = "Hours in Period";

// Resolve the measure by NAME, not a hardcoded id. The medallion catalogue
// collapse renumbered measures — the old id 1650 no longer exists ("Hours in
// Period" is now 300) — so binding by id re-breaks on any future renumber.
// Cached per-process after first lookup.
let cachedHoursInPeriodMeasureId: number | null = null;

async function getHoursInPeriodMeasureId(): Promise<number> {
  if (cachedHoursInPeriodMeasureId != null) return cachedHoursInPeriodMeasureId;
  const [row] = await db
    .select({ id: measureDefinitions.id })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.name, HOURS_IN_PERIOD_MEASURE_NAME))
    .limit(1);
  if (!row) {
    throw new Error(
      `Measure "${HOURS_IN_PERIOD_MEASURE_NAME}" not found in measure_definitions`,
    );
  }
  cachedHoursInPeriodMeasureId = row.id;
  return cachedHoursInPeriodMeasureId;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const HOURS_PER_DAY = 24;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 1 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month] ?? 30;
}

function daysInQuarter(year: number, quarterStartMonth: number): number {
  let days = 0;
  for (let i = 0; i < 3; i++) {
    days += daysInMonth(year, quarterStartMonth + i);
  }
  return days;
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function calculateHoursInPeriod(
  reportDate: Date,
  reportTypeName: string,
): number {
  const normalizedType = reportTypeName.trim().toLowerCase();
  const utcYear = reportDate.getUTCFullYear();
  const utcMonth = reportDate.getUTCMonth();

  if (normalizedType.includes("month")) {
    return daysInMonth(utcYear, utcMonth) * HOURS_PER_DAY;
  }

  if (normalizedType.includes("quarter")) {
    const quarterStartMonth = Math.floor(utcMonth / 3) * 3;
    return daysInQuarter(utcYear, quarterStartMonth) * HOURS_PER_DAY;
  }

  if (
    normalizedType.includes("annual") ||
    normalizedType.includes("financial year") ||
    normalizedType.includes("year")
  ) {
    return daysInYear(utcYear) * HOURS_PER_DAY;
  }

  return daysInYear(utcYear) * HOURS_PER_DAY;
}

export async function getReportPeriodDetails(
  reportPeriodId: number,
): Promise<{ reportDate: Date; reportTypeName: string }> {
  const [row] = await db
    .select({
      reportDate: reportPeriods.report_date,
      reportTypeName: managedListItems.name,
    })
    .from(reportPeriods)
    .leftJoin(
      managedListItems,
      eq(reportPeriods.report_type_id, managedListItems.id),
    )
    .where(eq(reportPeriods.id, reportPeriodId))
    .limit(1);

  if (!row) {
    throw new Error(`Report period ${reportPeriodId} not found`);
  }

  return {
    reportDate: row.reportDate,
    reportTypeName: row.reportTypeName ?? "",
  };
}

async function getAllMemberId(listName: string): Promise<number> {
  const [item] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        eq(managedLists.name, listName),
        eq(managedListItems.name, "All"),
      ),
    )
    .limit(1);
  if (!item) throw new Error(`"All" member not found for list: ${listName}`);
  return item.id;
}

export async function upsertHoursInPeriod(reportPeriodId: number): Promise<void> {
  // Hours-in-Period is benchmarking data — generate it ONLY for periods opted
  // into benchmarking (canonical predicate: is_utility AND bm_opted_in). This is
  // the single choke point for BOTH the interactive data-entry paths and the
  // bulk backfill, so a non-opted-in period (e.g. a kept-but-opted-out period)
  // never gets a system-generated Hours row that would then drive spurious KPI
  // failures. (per-period-participation-spec §4; #3/#8.)
  if (!(await isBenchmarkingPeriod(reportPeriodId))) {
    return;
  }

  const { reportDate, reportTypeName } =
    await getReportPeriodDetails(reportPeriodId);
  const hours = calculateHoursInPeriod(reportDate, reportTypeName);
  const hoursString = String(hours);
  const measureId = await getHoursInPeriodMeasureId();

  const [existing] = await db
    .select({ id: dataEntries.id })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.report_period_id, reportPeriodId),
        eq(dataEntries.measure_def_id, measureId),
        eq(dataEntries.is_deleted, false),
      ),
    )
    .limit(1);

  const dims = await getDefaultDimensionMap();

  if (existing) {
    await db
      .update(dataEntries)
      .set({
        value_numeric: hoursString,
        value: hoursString,
        status_id: DataEntryStatusId.Entered,
        updatedAt: new Date(),
      })
      .where(eq(dataEntries.id, existing.id));
  } else {
    await db.insert(dataEntries).values({
      report_period_id: reportPeriodId,
      measure_def_id: measureId,
      value_numeric: hoursString,
      value: hoursString,
      status_id: DataEntryStatusId.Entered,
      is_deleted: false,
      is_relevant: true,
      technology_id: dims.energySource,
      category_id: dims.energyType,
      provider_id: dims.energyProvider,
      asset_class_id: dims.unitType,
      customer_type_id: dims.customerType,
      payment_mode_id: dims.paymentMode,
      consumption_band_id: dims.consumptionBand,
      division_id: dims.division,
      gender_id: dims.gender,
      utility_function_id: dims.utilityFunction,
      updatedAt: new Date(),
    });
  }
}

async function getDefaultDimensionMap() {
  const [
    energySource,
    energyType,
    energyProvider,
    unitType,
    customerType,
    paymentMode,
    consumptionBand,
    division,
    gender,
    utilityFunction,
  ] = await Promise.all([
    getAllMemberId("Technology"),
    getAllMemberId("Category"),
    getAllMemberId("Provider"),
    getAllMemberId("Asset Class"),
    getAllMemberId("Customer Type"),
    getAllMemberId("Payment Mode"),
    getAllMemberId("Consumption Band"),
    getAllMemberId("Division"),
    getAllMemberId("Gender"),
    getAllMemberId("Utility Function"),
  ]);
  return {
    energySource,
    energyType,
    energyProvider,
    unitType,
    customerType,
    paymentMode,
    consumptionBand,
    division,
    gender,
    utilityFunction,
  };
}

/**
 * Reload/backfill entry point: (re)generate the system-computed "Hours in Period"
 * for every BENCHMARKING period. Idempotent (upsert). The interactive data-entry
 * paths call `upsertHoursInPeriod` per period, but a bulk reload does not touch
 * each period through the UI — so the reload (or a one-off post-reload run) must
 * call this, otherwise participating periods have no Hours-in-Period row and every
 * KPI that divides by it breaks.
 *
 * Scoped to opted-in periods (canonical predicate) — the blanket "every report
 * period" run is exactly what littered `data_entries` with Hours rows on periods
 * nobody participated in (Eugene stopped that run 2026-09-03). `upsertHoursInPeriod`
 * re-checks per period, so this is belt-and-suspenders. Returns periods processed.
 */
export async function backfillHoursInPeriodForAllPeriods(): Promise<{
  processed: number;
  failed: number;
}> {
  const periodIds = await listBenchmarkingPeriodIds();
  let processed = 0;
  let failed = 0;
  for (const id of periodIds) {
    try {
      await upsertHoursInPeriod(id);
      processed += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `[hours-in-period] backfill failed for report period ${id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { processed, failed };
}
