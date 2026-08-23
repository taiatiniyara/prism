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

const DISTRIBUTION_MEASURE_NAMES = [
  "Distribution Transformer Rated Capacity",
  "Network Length",
  "Network Unplanned Downtime Events",
  "FTE Employees",
] as const;

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.name, [...DISTRIBUTION_MEASURE_NAMES]));

  const fteId = measureDefs.find((m) => m.name === "FTE Employees")?.id;
  const allDlIds = measureDefs.map((m) => m.id);
  if (allDlIds.length === 0) return Response.json([]);

  // "FTE Employees" is scoped by utility function; resolve the Distribution member.
  const distributionListId = (
    await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, "Utility Function"))
      .limit(1)
  )[0]?.id;
  const distributionFunctionId = distributionListId
    ? (
        await db
          .select({ id: managedListItems.id })
          .from(managedListItems)
          .where(
            and(
              eq(managedListItems.list_id, distributionListId),
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
        inArray(dataEntries.measure_def_id, allDlIds),
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
    .where(eq(serviceAreas.is_active, true));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const { dataTypeNameById, itemsById } = await getValueResolutionContext(
    allDlIds,
  );

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  function findEntryValue(
    measureId: number,
    urpId: number,
    saId: number,
    functionId?: number,
  ) {
    const entry = entries.find(
      (l) =>
        l.measure_def_id === measureId &&
        l.report_period_id === urpId &&
        l.service_area_id === saId &&
        (functionId == null || l.utility_function_id === functionId),
    );
    return resolveEntryValue(
      entry,
      dataTypeNameById.get(measureId) ?? null,
      itemsById,
    );
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
            .map((sa) => ({
              ServiceAreaId: sa.id,
              "Distribution Transformer Rated Capacity": findEntryValue(
                measureDefs.find(
                  (m) => m.name === "Distribution Transformer Rated Capacity",
                )!.id,
                urp.id,
                sa.id,
              ),
              "Network Length": findEntryValue(
                measureDefs.find((m) => m.name === "Network Length")!.id,
                urp.id,
                sa.id,
              ),
              "Network Unplanned Downtime Events": findEntryValue(
                measureDefs.find(
                  (m) => m.name === "Network Unplanned Downtime Events",
                )!.id,
                urp.id,
                sa.id,
              ),
              "FTE Employees in Distribution": findEntryValue(
                fteId!,
                urp.id,
                sa.id,
                distributionFunctionId,
              ),
            })),
        };
      }),
  );
}
