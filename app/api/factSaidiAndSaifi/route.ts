import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { serviceAreas } from "@/db/schema/utility";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";

const SAIDI_SAIFI_MEASURE_NAMES = [
  "Total Planned Interruptions Events",
  "Total Planned Interruptions Customers Affected",
  "Total Planned Interruptions Customer Minutes",
  "Total Unplanned Interruptions Events",
  "Total Unplanned Interruptions Customers Affected",
  "Total Unplanned Interruptions Customer Minutes",
] as const;

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.name, [...SAIDI_SAIFI_MEASURE_NAMES]));

  const prismIds = measureDefs.map((m) => m.id);
  if (prismIds.length === 0) return Response.json([]);

  const entries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        inArray(dataEntries.measure_def_id, prismIds),
        eq(dataEntries.is_deleted, false),
      ),
    );
  const rps = await db
    .select()
    .from(reportPeriods)
    .where(publishedPeriodCondition);
  const allSa = await db
    .select()
    .from(serviceAreas)
    .where(eq(serviceAreas.is_active, true));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const { dataTypeNameById, itemsById } = await getValueResolutionContext(
    prismIds,
  );

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps
      .filter((r) => entries.some((l) => l.report_period_id === r.id))
      .map((urp) => {
        const reportType = findItem(urp.report_type_id)?.name;
        return {
          ReportType: reportType,
          ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
          ReportPeriodId: urp.id,
          UtilityId: urp.utility_id,
          Data: allSa
            .filter((sa) => sa.utility_id === urp.utility_id)
            .map((sa) =>
              measureDefs.reduce(
                (acc, dl) => {
                  const val = entries.find(
                    (l) =>
                      l.measure_def_id === dl.id &&
                      l.report_period_id === urp.id &&
                      l.service_area_id === sa.id,
                  );
                  return {
                    ServiceAreaId: sa.id,
                    UtilityId: urp.utility_id,
                    [dl.name]: resolveEntryValue(
                      val,
                      dataTypeNameById.get(dl.id) ?? null,
                      itemsById,
                    ),
                    ...acc,
                  };
                },
                {} as Record<string, unknown>,
              ),
            ),
        };
      }),
  );
}
