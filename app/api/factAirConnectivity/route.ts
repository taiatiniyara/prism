import { db } from "@/db/connection";
import { countries, countryContext as ccTable } from "@/db/schema/country";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { dlValue, formatReportPeriodIso } from "@/lib/legacy-dl-resolver";

async function getDlItemId(name: string): Promise<number | null> {
  const [item] = await db
    .select({ id: managedListItems.id })
    .from(managedListItems)
    .where(eq(managedListItems.name, name))
    .limit(1);
  return item?.id ?? null;
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json({ message: authorize.message }, { status: 401 });

  const [iataId, acp1000Id, acpuGdpId] = await Promise.all([
    getDlItemId("IATA Air Connectivity Score"),
    getDlItemId("Air Connectivity per 1000 people"),
    getDlItemId("Air Connectivity per GDP"),
  ]);

  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allUtils = await db.select().from(organisations).where(and(eq(organisations.is_utility, true), eq(organisations.is_active, true)));
  const allCountries = await db.select().from(countries);
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const ctxRows = await db.select().from(ccTable);

  const uMap = new Map(allUtils.map((u) => [u.id, u]));
  const cMap = new Map(allCountries.map((c) => [c.id, c]));

  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps.map((urp) => {
    const u = uMap.get(urp.utility_id);
    const country = u ? cMap.get(u.country_id) : undefined;
    const iata = ctxRows.find((c) => c.country_id === country?.id && c.dl_def_id === iataId);
    const acp = ctxRows.find((c) => c.country_id === country?.id && c.dl_def_id === acp1000Id);
    const acg = ctxRows.find((c) => c.country_id === country?.id && c.dl_def_id === acpuGdpId);
    const reportType = findItem(urp.report_type_id)?.name;
    return {
      "Report Type": reportType,
      "Report Period": formatReportPeriodIso(urp.report_date, reportType),
      Country: country?.name,
      "Air Connectivity": dlValue(iata?.value),
      "Air Connectivity per 1000 people": dlValue(acp?.value),
      "Air Connectivity per GDP": dlValue(acg?.value),
      Source: iata?.source_url || "unknown",
    };
  }));
}
