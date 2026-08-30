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

const GENERATION_MEASURE_NAMES = [
  "Electricity Demand Average Load",
  "Electricity Demand Peak Load",
  "FTE Employees",
  "Station Auxilliary Usage",
] as const;

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.name, [...GENERATION_MEASURE_NAMES]));

  const avgLoadId = measureDefs.find(
    (m) => m.name === "Electricity Demand Average Load",
  )?.id;
  const peakLoadId = measureDefs.find(
    (m) => m.name === "Electricity Demand Peak Load",
  )?.id;
  const fteId = measureDefs.find((m) => m.name === "FTE Employees")?.id;
  const consumedInternallyId = measureDefs.find(
    (m) => m.name === "Station Auxilliary Usage",
  )?.id;

  const allDlIds = measureDefs.map((m) => m.id);
  if (allDlIds.length === 0) return Response.json([]);

  // Resolve the "Generation" utility-function member so FTE can be scoped to it.
  const generationListId = (
    await db
      .select({ id: managedLists.id })
      .from(managedLists)
      .where(eq(managedLists.name, "Utility Function"))
      .limit(1)
  )[0]?.id;
  const generationFunctionId = generationListId
    ? (
        await db
          .select({ id: managedListItems.id })
          .from(managedListItems)
          .where(
            and(
              eq(managedListItems.list_id, generationListId),
              eq(managedListItems.name, "Generation"),
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
    .where(publishedPeriodCondition);

  const allServiceAreas = await db
    .select()
    .from(serviceAreas)
    .where(eq(serviceAreas.is_active, true));

  const allManagedItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const allManagedLists = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.is_active, true));

  const { dataTypeNameById, itemsById } = await getValueResolutionContext(
    allDlIds,
  );

  function findManagedList(id: number | null) {
    if (!id) return undefined;
    return allManagedItems.find(
      (m) => m.id === id && allManagedLists.some((l) => l.id === m.list_id),
    );
  }

  function findEntryValue(
    measureId: number | undefined,
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
      dataTypeNameById.get(measureId ?? -1) ?? null,
      itemsById,
    );
  }

  return Response.json(
    rps.map((urp) => {
      const reportType = findManagedList(urp.report_type_id)?.name;
      const reportDate = formatReportPeriodIso(urp.report_date, reportType);

      const data = allServiceAreas
        .filter((sa) => sa.utility_id === urp.utility_id && !sa.is_virtual)
        .map((sa) => ({
          ServiceAreaId: sa.id,
          "Electricity Demand Average Load": findEntryValue(
            avgLoadId,
            urp.id,
            sa.id,
          ),
          "Electricity Demand Peak Load": findEntryValue(
            peakLoadId,
            urp.id,
            sa.id,
          ),
          "FTE Employees in Generation": findEntryValue(
            fteId,
            urp.id,
            sa.id,
            generationFunctionId,
          ),
          "Gen Electricity Consumed Internally": findEntryValue(
            consumedInternallyId,
            urp.id,
            sa.id,
          ),
        }));

      return {
        "Report Type": reportType,
        "Report Period": reportDate,
        UtilityId: urp.utility_id,
        Data: data,
      };
    }),
  );
}
