import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";

export async function GET() {
  const allEntries = await db
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.is_deleted, false));

  const allRps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allUtils = await db
    .select()
    .from(organisations)
    .where(and(eq(organisations.is_utility, true), eq(organisations.is_active, true)));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const allLists = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.is_active, true));

  const utilsMap = new Map(allUtils.map((u) => [u.id, u]));
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  const categories = allItems.filter((m) =>
    allLists.some((l) => l.id === m.list_id && l.name === "Data Label Category"),
  );

  const outList = allRps.map((period) => {
    const utility = utilsMap.get(period.utility_id);
    const catPercentages = categories.reduce((acc, c) => {
      const dlInCategory = allItems.filter((m) =>
        allLists.some((l) => l.id === m.list_id && l.id === c.list_id),
      ).length;

      const dataForPeriod = allEntries.filter(
        (e) => e.report_period_id === period.id,
      ).length;

      const percentage = dlInCategory > 0
        ? ((dataForPeriod / (dlInCategory * allRps.length)) * 100).toFixed(0)
        : "0";

      return { [c.name]: `${percentage}%`, ...acc };
    }, {} as Record<string, string>);

    const reportType = findItem(period.report_type_id)?.name;

    return {
      ReportType: reportType,
      ReportPeriod: period.report_date?.toISOString() ?? null,
      Utility: utility?.acronym ?? "",
      ...catPercentages,
    };
  });

  return Response.json(outList);
}
