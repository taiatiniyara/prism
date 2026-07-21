import { db } from "@/db/connection";
import { inputDlDefMappings } from "@/db/schema/dataEntry";
import { countryContext } from "@/db/schema/country";
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

export async function getCountryContextValue(
  countryId: number,
  trainingDlId: number,
): Promise<string | null> {
  const dlName = await resolveDlName(trainingDlId);
  if (!dlName) return null;

  const [item] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .where(eq(managedListItems.name, dlName))
    .limit(1);

  if (!item) return null;

  const [ctx] = await db
    .select({ value: countryContext.value })
    .from(countryContext)
    .where(
      and(
        eq(countryContext.country_id, countryId),
        eq(countryContext.dl_def_id, item.id),
      ),
    )
    .limit(1);

  return ctx?.value ?? null;
}

export async function getSubmittedReportPeriods() {
  return db.select().from(reportPeriods).where(eq(reportPeriods.status_id, 3));
}

export function formatReportPeriodIso(
  reportDate: Date | string | null,
  reportType: string | null | undefined,
): string | null {
  if (!reportDate) return null;
  const d = typeof reportDate === "string" ? new Date(reportDate) : reportDate;
  if (isNaN(d.getTime())) return null;

  if (reportType === "Financial Year") {
    d.setFullYear(d.getFullYear() - 1);
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
