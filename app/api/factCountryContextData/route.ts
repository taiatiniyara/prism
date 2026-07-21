import { db } from "@/db/connection";
import { countryContext as ccTable } from "@/db/schema/country";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { organisations } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import {
  dlValue,
  formatReportPeriodIso,
} from "@/lib/legacy/legacy-dl-resolver";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const rps = await db
    .select()
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));
  const allUtils = await db
    .select()
    .from(organisations)
    .where(
      and(
        eq(organisations.is_utility, true),
        eq(organisations.is_active, true),
      ),
    );
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const ctxRows = await db.select().from(ccTable);
  const inputDefs = await db
    .select()
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true));

  const uMap = new Map(allUtils.map((u) => [u.id, u]));
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps.map((urp) => {
      const u = uMap.get(urp.utility_id);
      const ccData = ctxRows
        .filter((cc) => cc.country_id === (u?.country_id ?? -1))
        .reduce(
          (acc, cc) => {
            const dl = inputDefs.find((d) => d.id === cc.dl_def_id);
            return { [dl?.name ?? ""]: dlValue(cc.value), ...acc };
          },
          {} as Record<string, unknown>,
        );
      const reportType = findItem(urp.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
        Country: u
          ? allItems.find((m) => m.id === u.country_id)?.name
          : undefined,
        ...ccData,
      };
    }),
  );
}
