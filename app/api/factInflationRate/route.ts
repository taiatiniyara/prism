import { db } from "@/db/connection";
import { countryContext as ccTable } from "@/db/schema/country";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { dlValue, formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";

async function getDlItemId(name: string): Promise<number | null> {
  const [item] = await db.select({ id: managedListItems.id }).from(managedListItems).where(eq(managedListItems.name, name)).limit(1);
  return item?.id ?? null;
}

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json({ message: authorize.message }, { status: 401 });

  const dlItemId = await getDlItemId("Inflation Rate");

  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allUtils = await db.select().from(organisations).where(and(eq(organisations.is_utility, true), eq(organisations.is_active, true)));
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const ctxRows = dlItemId ? await db.select().from(ccTable).where(eq(ccTable.dl_def_id, dlItemId)) : [];

  const uMap = new Map(allUtils.map((u) => [u.id, u]));
  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps.map((urp) => {
    const u = uMap.get(urp.utility_id);
    const cc = ctxRows.find((c) => c.country_id === (u?.country_id ?? -1));
    const reportType = findItem(urp.report_type_id)?.name;
    return {
      "Report Type": reportType ?? "",
      "Report Period": formatReportPeriodIso(urp.report_date, reportType ?? ""),
      Country: u ? allItems.find((m) => m.id === u.country_id)?.name : "",
      "Inflation Rate": dlValue(cc?.value),
      Source: cc?.source_url || cc?.source_doc || "unknown",
    };
  }));
}
