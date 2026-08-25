import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { serviceAreas } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";

const METERING_MEASURE_NAMES = [
  "Customers Served",
  "Electricity Sold to Customers",
] as const;

// Power BI column label for the distribution-scoped "Customers Served" measure.
const METERING_COLUMN_LABELS: Record<string, string> = {
  "Customers Served": "Electricity Customers",
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.name, [...METERING_MEASURE_NAMES]));

  const prismIds = measureDefs.map((m) => m.id);
  if (prismIds.length === 0) return Response.json([]);

  // Scope metering (customers sold) to the Distribution utility function.
  const functionListId = (
    await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, "Utility Function"))
      .limit(1)
  )[0]?.id;
  const distributionFunctionId = functionListId
    ? (
        await db
          .select({ id: managedListItems.id })
          .from(managedListItems)
          .where(
            and(
              eq(managedListItems.list_id, functionListId),
              eq(managedListItems.name, "Distribution"),
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
    .where(isNotNull(reportPeriods.status_id));
  const allSa = await db
    .select()
    .from(serviceAreas)
    .where(
      and(eq(serviceAreas.is_active, true), eq(serviceAreas.is_virtual, false)),
    );
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
      .filter((urp) => entries.some((d) => d.report_period_id === urp.id))
      .map((urp) => {
        const reportType = findItem(urp.report_type_id)?.name;
        return {
          ReportType: reportType,
          ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
          UtilityId: urp.utility_id,
          Data: allSa
            .filter((sa) => sa.utility_id === urp.utility_id)
            .map((sa) => {
              const dataValues = measureDefs.reduce(
                (acc, dl) => {
                  const entry = entries.find(
                    (l) =>
                      l.measure_def_id === dl.id &&
                      l.report_period_id === urp.id &&
                      l.service_area_id === sa.id &&
                      (distributionFunctionId == null ||
                        l.utility_function_id === distributionFunctionId),
                  );
                  const label = METERING_COLUMN_LABELS[dl.name] ?? dl.name;
                  return {
                    ...acc,
                    [label]: resolveEntryValue(
                      entry,
                      dataTypeNameById.get(dl.id) ?? null,
                      itemsById,
                    ),
                  };
                },
                {} as Record<string, unknown>,
              );
              return { ServiceAreaId: sa.id, ...dataValues };
            }),
        };
      }),
  );
}
