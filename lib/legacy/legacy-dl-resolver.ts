import { db } from "@/db/connection";
import { inputDlDefMappings } from "@/db/schema/dataEntry";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { eq, and, inArray } from "drizzle-orm";

export async function getManagedListByName(
  listName: string,
  activeOnly = true,
) {
  const [list] = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.name, listName))
    .limit(1);
  if (!list) return [];

  const conditions = [eq(managedListItems.list_id, list.id)];
  if (activeOnly) {
    conditions.push(eq(managedListItems.is_active, true));
  }

  return db
    .select()
    .from(managedListItems)
    .where(and(...conditions));
}

export async function resolveDlId(
  trainingDlId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ measure_def_id: inputDlDefMappings.measure_def_id })
    .from(inputDlDefMappings)
    .where(eq(inputDlDefMappings.training_dl_def_id, trainingDlId))
    .limit(1);
  return row?.measure_def_id ?? null;
}

export async function resolveDlName(
  trainingDlId: number,
): Promise<string | null> {
  const [row] = await db
    .select({ name: inputDlDefMappings.training_dl_name })
    .from(inputDlDefMappings)
    .where(eq(inputDlDefMappings.training_dl_def_id, trainingDlId))
    .limit(1);
  return row?.name ?? null;
}

export async function resolveDlIds(
  trainingDlIds: number[],
): Promise<Map<number, number>> {
  const rows = await db
    .select()
    .from(inputDlDefMappings)
    .where(inArray(inputDlDefMappings.training_dl_def_id, trainingDlIds));
  return new Map(rows.map((r) => [r.training_dl_def_id, r.measure_def_id]));
}

export async function getSubmittedReportPeriods() {
  return db.select().from(reportPeriods).where(eq(reportPeriods.status_id, 3));
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse organisations.financial_year_end ("30 Sep 2024", "31 Dec 2024") → {month, day}. */
export function parseFinancialYearEnd(
  fye: string | null | undefined,
): { month: number; day: number } | null {
  if (!fye) return null;
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})/.exec(fye.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  if (!month || !day) return null;
  return { month, day };
}

/**
 * The fiscal YEAR a report period represents — the calendar year the financial
 * year STARTS in (the platform's labelling convention). This is the alignment key
 * between a submission's period and country_context.period_year.
 *
 * When the utility's financial_year_end is known we use it (robust to imperfect
 * report_date values): a full calendar-year FY (ends 31 Dec) → the report_date's
 * year; otherwise the FY spans into the prior year → its start year. When it isn't
 * known we derive the same start year from report_date itself (report_date is the
 * FY-end date), which fixes the old blanket "−1" for calendar-year utilities.
 */
export function fiscalYearForReportPeriod(
  reportDate: Date | string | null,
  reportType: string | null | undefined,
  financialYearEnd?: string | null,
): number | null {
  if (!reportDate) return null;
  const d = typeof reportDate === "string" ? new Date(reportDate) : reportDate;
  if (isNaN(d.getTime())) return null;
  if (reportType !== "Financial Year") return d.getFullYear();

  const fye = parseFinancialYearEnd(financialYearEnd);
  if (fye) {
    if (fye.month === 12 && fye.day === 31) return d.getFullYear(); // calendar-year FY
    // FY ends at fye.month/day; find the FY-end on/after d, label by start year.
    // Compare by calendar components (not Date objects) to avoid UTC/local skew.
    let endYear = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const afterEnd = m > fye.month || (m === fye.month && day > fye.day);
    if (afterEnd) endYear += 1;
    return endYear - 1;
  }

  // Fallback: report_date is the FY-end date → start year = (report_date + 1d − 1y)
  const s = new Date(d);
  s.setDate(s.getDate() + 1);
  s.setFullYear(s.getFullYear() - 1);
  return s.getFullYear();
}

export function formatReportPeriodIso(
  reportDate: Date | string | null,
  reportType: string | null | undefined,
  financialYearEnd?: string | null,
): string | null {
  if (!reportDate) return null;
  const d = typeof reportDate === "string" ? new Date(reportDate) : reportDate;
  if (isNaN(d.getTime())) return null;

  if (reportType === "Financial Year") {
    const fy = fiscalYearForReportPeriod(d, reportType, financialYearEnd);
    if (fy != null) d.setFullYear(fy);
    return d.toISOString();
  }

  return d.toISOString();
}

export const dlValue = (
  val: string | null | undefined,
): string | number | null => {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? val : n;
};

export const dlValueOrNull = (
  val: string | null | undefined,
): string | null => {
  if (val === null || val === undefined || val === "0") return null;
  return val;
};
