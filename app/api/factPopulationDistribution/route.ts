import { db } from "@/db/connection";
import { countryContext as ccTable } from "@/db/schema/country";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { dlValue, formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";

async function getDlItemIds(names: string[]): Promise<(number | null)[]> {
  const items = await db.select().from(managedListItems).where(inArray(managedListItems.name, names));
  return names.map((n) => items.find((m) => m.name === n)?.id ?? null);
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json({ message: authorize.message }, { status: 401 });

  const [urbanId, ruralId] = await getDlItemIds(["Urban Population", "Rural Population"]);
  const dlIds = [urbanId, ruralId].filter((id): id is number => id != null);

  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allUtils = await db.select().from(organisations).where(and(eq(organisations.is_utility, true), eq(organisations.is_active, true)));
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const ctxRows = dlIds.length > 0 ? await db.select().from(ccTable).where(inArray(ccTable.dl_def_id, dlIds)) : [];

  const uMap = new Map(allUtils.map((u) => [u.id, u]));
  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps.map((urp) => {
    const u = uMap.get(urp.utility_id);
    const dlValues = ctxRows
      .filter((d) => d.country_id === (u?.country_id ?? -1) && (d.dl_def_id === urbanId || d.dl_def_id === ruralId))
      .reduce((acc, d) => {
        const item = allItems.find((m) => m.id === d.dl_def_id);
        return { [item?.name ?? ""]: dlValue(d.value), Source: d.source_url || d.source_doc || "unknown", ...acc };
      }, {} as Record<string, unknown>);
    const reportType = findItem(urp.report_type_id)?.name;
    return { ReportType: reportType, ReportPeriod: formatReportPeriodIso(urp.report_date, reportType), Country: u ? allItems.find((m) => m.id === u.country_id)?.name : undefined, ...dlValues };
  }));
}
