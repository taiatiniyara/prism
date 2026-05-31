import { db } from "@/db/connection";
import { countryContext as ccTable, countries } from "@/db/schema/country";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { dlValue, formatReportPeriodIso } from "@/lib/legacy-dl-resolver";

async function getDlItemId(name: string): Promise<number | null> {
  const [item] = await db.select({ id: managedListItems.id }).from(managedListItems).where(eq(managedListItems.name, name)).limit(1);
  return item?.id ?? null;
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json(authorize.message);

  const dlItemId = await getDlItemId("Electricity Access");

  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allUtils = await db.select().from(organisations).where(and(eq(organisations.is_utility, true), eq(organisations.is_active, true)));
  const allCountries = await db.select().from(countries);
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const ctxRows = dlItemId ? await db.select().from(ccTable).where(eq(ccTable.dl_def_id, dlItemId)) : [];

  const uMap = new Map(allUtils.map((u) => [u.id, u]));
  const cMap = new Map(allCountries.map((c) => [c.id, c]));

  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps.map((urp) => {
    const u = uMap.get(urp.utility_id);
    const country = u ? cMap.get(u.country_id) : undefined;
    const val = ctxRows.find((c) => c.country_id === country?.id);
    const reportType = findItem(urp.report_type_id)?.name;
    return {
      ReportType: reportType,
      ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
      Country: country?.name,
      "Electricity Access": dlValue(val?.value),
      Source: val?.source_url || val?.source_doc || "unknown",
    };
  }));
}
