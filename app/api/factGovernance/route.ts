import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import {
  formatReportPeriodIso,
} from "@/lib/legacy/legacy-dl-resolver";
import { resolveEntryValue } from "@/lib/legacy/entry-value";

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const entries = await db
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.is_deleted, false));
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(isNotNull(reportPeriods.status_id));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const inputDefs = await db
    .select()
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.measures_group_id, 203),
      ),
    );

  const dlMap = new Map(inputDefs.map((d) => [d.id, d]));
  const itemsById = new Map(allItems.map((i) => [i.id, i.name]));
  const dataTypeNameById = new Map(
    inputDefs.map((d) => [d.id, itemsById.get(d.data_type_id) ?? null]),
  );
  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps.map((urp) => {
      const dlValues = entries
        .filter((e) => e.report_period_id === urp.id)
        .reduce(
          (acc, e) => {
            const dl = dlMap.get(e.measure_def_id);
            return {
              [dl?.name ?? ""]: resolveEntryValue(
                e,
                dataTypeNameById.get(e.measure_def_id) ?? null,
                itemsById,
              ),
              ...acc,
            };
          },
          {} as Record<string, unknown>,
        );
      const reportType = findItem(urp.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
        UtilityId: urp.utility_id,
        ...dlValues,
      };
    }),
  );
}
