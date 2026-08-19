import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { units, serviceAreas } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, isNotNull } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
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
  const allSa = await db
    .select()
    .from(serviceAreas)
    .where(eq(serviceAreas.is_active, true));
  const allResources = await db
    .select()
    .from(units)
    .where(eq(units.is_virtual, false));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const inputDefs = await db
    .select()
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true));

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  const itemsById = new Map(allItems.map((i) => [i.id, i.name]));
  const dataTypeNameById = new Map(
    inputDefs.map((d) => [d.id, itemsById.get(d.data_type_id) ?? null]),
  );

  return Response.json(
    rps
      .filter((r) => entries.some((l) => l.report_period_id === r.id))
      .sort((a, b) => a.utility_id - b.utility_id)
      .map((urp) => {
        const rpGens = allResources.filter((gen) =>
          gen.period_entries?.some((pe) => pe.report_period_id === urp.id),
        );
        const reportType = findItem(urp.report_type_id)?.name;
        return {
          ReportType: reportType,
          ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
          UtilityId: urp.utility_id,
          Data: allSa
            .filter((sa) => sa.utility_id === urp.utility_id)
            .map((sa) =>
              inputDefs.reduce(
                (acc, dl) => {
                  const val = entries.find(
                    (l) =>
                      l.measure_def_id === dl.id &&
                      l.report_period_id === urp.id &&
                      rpGens.find(
                        (g) =>
                          g.id === l.unit_id &&
                          g.service_area_id === sa.id,
                      ),
                  );
                  return {
                    ...acc,
                    ServiceAreaId: sa.id,
                    [dl.name]: resolveEntryValue(
                      val,
                      dataTypeNameById.get(dl.id) ?? null,
                      itemsById,
                    ),
                  };
                },
                {} as Record<string, unknown>,
              ),
            ),
        };
      }),
  );
}
