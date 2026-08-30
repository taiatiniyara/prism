import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { serviceAreas } from "@/db/schema/utility";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";

// Transmission measures, each scoped by the Transmission utility function and
// mapped to its legacy semantic-model column name.
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
    name: "Electricity Sent to Grid",
    label: "Transmission Network Electricity Sent to Grid",
  },
  {
    name: "Network Planned Downtime Events",
    label: "Transmission Network Planned Downtime Events",
  },
  {
    name: "Network Planned Downtime Hours",
    label: "Transmission Network Planned Downtime Minutes",
  },
  {
    name: "Network Unplanned Downtime Events",
    label: "Transmission Network Unplanned Downtime Events",
  },
  {
    name: "Network Unplanned Downtime Hours",
    label: "Transmission Network Unplanned Downtime Minutes",
  },
  { name: "FTE Employees", label: "FTE Employees in Transmission" },
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

  const labelByName = new Map(
    TRANSMISSION_MEASURES.map((m) => [m.name, m.label]),
  );
  const prismIds = measureDefs.map((m) => m.id);
  if (prismIds.length === 0) return Response.json([]);

  // Resolve the Transmission utility function member.
  const functionListId = (
    await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, "Utility Function"))
      .limit(1)
  )[0]?.id;
  const transmissionFunctionId = functionListId
    ? (
        await db
          .select({ id: managedListItems.id })
          .from(managedListItems)
          .where(
            and(
              eq(managedListItems.list_id, functionListId),
              eq(managedListItems.name, "Transmission"),
            ),
          )
          .limit(1)
      )[0]?.id
    : undefined;

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
          UtilityId: urp.utility_id,
          Data: allSa
            .filter((sa) => sa.utility_id === urp.utility_id)
            .map((sa) =>
              measureDefs.reduce(
                (acc, dl) => {
                  const entry = entries.find(
                    (l) =>
                      l.measure_def_id === dl.id &&
                      l.report_period_id === urp.id &&
                      l.service_area_id === sa.id &&
                      (transmissionFunctionId == null ||
                        l.utility_function_id === transmissionFunctionId),
                  );
                  const label = labelByName.get(dl.name) ?? dl.name;
                  return {
                    ...acc,
                    [label]: resolveEntryValue(
                      entry,
                      dataTypeNameById.get(dl.id) ?? null,
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
