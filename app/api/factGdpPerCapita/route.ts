import { db } from "@/db/connection";
import { countries, countryContext as ccTable } from "@/db/schema/country";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { dlValue, formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";

async function getDlItemId(name: string): Promise<number | null> {
  const [item] = await db.select({ id: managedListItems.id }).from(managedListItems).where(eq(managedListItems.name, name)).limit(1);
  return item?.id ?? null;
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json({ message: authorize.message }, { status: 401 });

  const dlItemId = await getDlItemId("GDP Per Capita");

  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allCountries = await db.select().from(countries);
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const ctxRows = dlItemId ? await db.select().from(ccTable).where(eq(ccTable.dl_def_id, dlItemId)) : [];

  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps.map((r) => {
    const country = allCountries.find((c) => c.id === r.utility_id);
    const cc = ctxRows.find((row) => row.country_id === country?.id);
    const reportType = findItem(r.report_type_id)?.name;
    return {
      "Report Type": reportType,
      "Report Period": formatReportPeriodIso(r.report_date, reportType),
      Country: country?.iso_code_alpha3,
      "GDP Per Capita": dlValue(cc?.value),
      Source: cc?.source_doc || cc?.source_url || "unknown",
    };
  }));
}
