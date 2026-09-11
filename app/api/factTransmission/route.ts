import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { serviceAreas } from "@/db/schema/utility";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { eq, and, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";

// Transmission measures in p1's emission order (its Transmission data-label
// list). p1 names the hours columns "<name> Downtime" with no unit suffix; FTE
// and Sent-to-Grid are not part of p1's transmission feed. The measures are
// already transmission-scoped by definition, so no utility-function filter is
// applied (entries can live under any function, as in factDistribution).
const TRANSMISSION_MEASURES: { name: string; label: string }[] = [
  { name: "Network Length", label: "Transmission Network Length" },
  {
    name: "Customers Served",
    label: "Transmission Network Customers Served",
  },
  {
    name: "Electricity Sold to Customers",
    label: "Transmission Electricity Sold to Customers",
  },
  {
    name: "Network Planned Downtime Events",
    label: "Transmission Network Planned Downtime Events",
  },
  {
    name: "Network Planned Downtime Hours",
    label: "Transmission Network Planned Downtime",
  },
  {
    name: "Network Unplanned Downtime Events",
    label: "Transmission Network Unplanned Downtime Events",
  },
  {
    name: "Network Unplanned Downtime Hours",
    label: "Transmission Network Unplanned Downtime",
  },
];

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(
      inArray(
        measureDefinitions.name,
        TRANSMISSION_MEASURES.map((m) => m.name),
      ),
    );
  const idByName = new Map(measureDefs.map((m) => [m.name, m.id]));
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

  const { dataTypeNameById, itemsById } = await getValueResolutionContext(
    prismIds,
  );

  function findItem(id: number | null) {
    return id ? itemsById.get(id) : undefined;
  }

  return Response.json(
    rps
      .filter((r) => entries.some((l) => l.report_period_id === r.id))
      .sort((a, b) => a.utility_id - b.utility_id)
      .map((urp) => {
        const reportType = findItem(urp.report_type_id);
        return {
          ReportType: reportType,
          ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
          ReportPeriodId: urp.id,
          UtilityId: urp.utility_id,
          Data: allSa
            .filter((sa) => sa.utility_id === urp.utility_id)
            .map((sa) =>
              TRANSMISSION_MEASURES.reduce(
                (acc, m) => {
                  const dl = idByName.get(m.name);
                  const entry = dl
                    ? entries.find(
                        (l) =>
                          l.measure_def_id === dl &&
                          l.report_period_id === urp.id &&
                          l.service_area_id === sa.id,
                      )
                    : undefined;
                  return {
                    ...acc,
                    [m.label]: resolveEntryValue(
                      entry,
                      dl ? (dataTypeNameById.get(dl) ?? null) : null,
                      itemsById,
                    ),
                  };
                },
                { ServiceAreaId: sa.id } as Record<string, unknown>,
              ),
            ),
        };
      }),
  );
}
