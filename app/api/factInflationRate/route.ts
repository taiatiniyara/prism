import { db } from "@/db/connection";
import { countries } from "@/db/schema/country";
import { organisations } from "@/db/schema/utility";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import { getResolvedContextRows } from "@/lib/legacy/context-data";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const ctxRows = await getResolvedContextRows(221);
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(publishedPeriodCondition);
  const allUtils = await db
    .select()
    .from(organisations)
    .where(
      and(
        eq(organisations.is_utility, true),
        eq(organisations.is_active, true),
      ),
    );
  const allCountries = await db.select().from(countries);
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const uMap = new Map(allUtils.map((u) => [u.id, u]));
  const cMap = new Map(allCountries.map((c) => [c.id, c]));
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps.map((urp) => {
      const u = uMap.get(urp.utility_id);
      const country = u ? cMap.get(u.country_id) : undefined;
      const cc = ctxRows.find(
        (r) =>
          r.report_period_id === urp.id && r.country_id === (country?.id ?? -1) &&
          r.measureName === "Inflation Rate",
      );
      const reportType = findItem(urp.report_type_id)?.name;
      return {
        "Report Type": reportType,
        "Report Period": formatReportPeriodIso(urp.report_date, reportType, u?.financial_year_end),
        Country: country?.name,
        "Inflation Rate": cc?.value ?? null,
        Source: "unknown",
      };
    }),
  );
}
