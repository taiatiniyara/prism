import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const allEntries = await db
    .select({ report_period_id: dataEntries.report_period_id, status: dataEntries.status })
    .from(dataEntries)
    .where(eq(dataEntries.is_deleted, false))
    .limit(50000);

  const allRps = await db
    .select({ id: reportPeriods.id, utility_id: reportPeriods.utility_id, report_date: reportPeriods.report_date, report_type_id: reportPeriods.report_type_id })
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));

  const allUtils = await db
    .select({ id: organisations.id, acronym: organisations.acronym })
    .from(organisations)
    .where(and(eq(organisations.is_utility, true), eq(organisations.is_active, true)));

  const allItems = await db
    .select({ id: managedListItems.id, name: managedListItems.name, list_id: managedListItems.list_id })
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const allLists = await db
    .select({ id: managedLists.id, name: managedLists.name })
    .from(managedLists)
    .where(eq(managedLists.is_active, true));

  const utilsMap = new Map(allUtils.map((u) => [u.id, u]));
  const itemsById = new Map(allItems.map((i) => [i.id, i]));

  const dlCategoryList = allLists.find((l) => l.name === "Data Label Category");
  const dlCategoryIds = dlCategoryList
    ? new Set(allItems.filter((i) => i.list_id === dlCategoryList.id).map((i) => i.id))
    : new Set<number>();

  const categories = allItems.filter((m) => dlCategoryIds.has(m.id));

  const entriesByPeriodId = new Map<number, number>();
  for (const e of allEntries) {
    entriesByPeriodId.set(e.report_period_id, (entriesByPeriodId.get(e.report_period_id) ?? 0) + 1);
  }

  const dlInCategory = dlCategoryIds.size;

  const outList = allRps.map((period) => {
    const utility = utilsMap.get(period.utility_id);
    const dataForPeriod = entriesByPeriodId.get(period.id) ?? 0;

    const catPercentages = categories.reduce((acc, c) => {
      const percentage = dlInCategory > 0
        ? ((dataForPeriod / dlInCategory) * 100).toFixed(0)
        : "0";

      return { [c.name]: `${percentage}%`, ...acc };
    }, {} as Record<string, string>);

    const reportTypeItem = period.report_type_id ? itemsById.get(period.report_type_id) : undefined;

    return {
      ReportType: reportTypeItem?.name,
      ReportPeriod: period.report_date?.toISOString() ?? null,
      Utility: utility?.acronym ?? "",
      ...catPercentages,
    };
  });

  return Response.json(outList);
}
