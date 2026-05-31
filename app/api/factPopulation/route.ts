import { db } from "@/db/connection";
import { countries, countryContext } from "@/db/schema/country";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import {
  resolveDlName,
  formatReportPeriodIso,
  dlValue,
} from "@/lib/legacy-dl-resolver";

const NationalPopulationTrainingId = 5203040006;

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json(authorize.message);
  }

  const nationalPopName = await resolveDlName(NationalPopulationTrainingId);

  const rps = await db
    .select()
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));

  const allUtilities = await db
    .select()
    .from(organisations)
    .where(
      and(
        eq(organisations.is_utility, true),
        eq(organisations.is_active, true),
      ),
    );

  const allCountries = await db.select().from(countries);

  const allManagedItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const allManagedLists = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.is_active, true));

  let nationalPopItemId: number | null = null;
  if (nationalPopName) {
    const [item] = allManagedItems.filter((m) => m.name === nationalPopName);
    nationalPopItemId = item?.id ?? null;
  }

  const contextRows =
    nationalPopItemId != null
      ? await db
          .select()
          .from(countryContext)
          .where(eq(countryContext.dl_def_id, nationalPopItemId))
      : [];

  function findManagedList(id: number | null) {
    if (!id) return undefined;
    return allManagedItems.find(
      (m) =>
        m.id === id &&
        allManagedLists.some((l) => l.id === m.list_id),
    );
  }

  const utilityMap = new Map(allUtilities.map((u) => [u.id, u]));
  const countryMap = new Map(allCountries.map((c) => [c.id, c]));

  return Response.json(
    rps.map((urp) => {
      const utility = utilityMap.get(urp.utility_id);
      const country = utility ? countryMap.get(utility.country_id) : undefined;
      const cc = contextRows.find(
        (row) => row.country_id === (country?.id ?? -1),
      );
      const reportType = findManagedList(urp.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(
          urp.report_date,
          reportType,
        ),
        Country: country?.name,
        Population: dlValue(cc?.value),
        Source: cc?.source_url || cc?.source_doc || "unknown",
      };
    }),
  );
}
