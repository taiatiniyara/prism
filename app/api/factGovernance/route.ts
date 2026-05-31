import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { dlValue, formatReportPeriodIso } from "@/lib/legacy-dl-resolver";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json(authorize.message);

  const entries = await db.select().from(dataEntries).where(eq(dataEntries.is_deleted, false));
  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const inputDefs = await db.select().from(inputDefinitions).where(eq(inputDefinitions.is_active, true));

  const dlMap = new Map(inputDefs.map((d) => [d.id, d]));
  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps.map((urp) => {
    const dlValues = entries
      .filter((e) => e.report_period_id === urp.id)
      .reduce((acc, e) => {
        const dl = dlMap.get(e.input_def_id);
        return { [dl?.name ?? ""]: dlValue(e.value), ...acc };
      }, {} as Record<string, unknown>);
    const reportType = findItem(urp.report_type_id)?.name;
    return {
      ReportType: reportType,
      ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
      UtilityId: urp.utility_id,
      ...dlValues,
    };
  }));
}
