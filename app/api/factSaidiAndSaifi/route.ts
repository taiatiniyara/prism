import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { energyResources, serviceAreas } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { resolveDlIds, dlValue, formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";

const trainingIds = {
  TotalPlannedInterruptionEvents: 3213040300,
  TotalUnplannedInterruptionCustomerMinutes: 3213040305,
};

export async function GET() {
  const idMap = await resolveDlIds(Object.values(trainingIds));
  const prismIds = Array.from(idMap.values()).filter((id): id is number => id != null);
  if (prismIds.length === 0) return Response.json([]);

  const entries = await db.select().from(dataEntries).where(and(inArray(dataEntries.input_def_id, prismIds), eq(dataEntries.is_deleted, false)));
  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allSa = await db.select().from(serviceAreas).where(eq(serviceAreas.is_active, true));
  const allResources = await db.select().from(energyResources).where(eq(energyResources.is_virtual, false));
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));
  const inputDefs = await db.select().from(inputDefinitions).where(and(inArray(inputDefinitions.id, prismIds), eq(inputDefinitions.is_active, true)));

  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps
    .filter((r) => entries.some((l) => l.report_period_id === r.id))
    .map((urp) => {
      const reportType = findItem(urp.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
        UtilityId: urp.utility_id,
        Data: allSa.filter((sa) => sa.utility_id === urp.utility_id).map((sa) =>
          inputDefs.reduce((acc, dl) => {
            const val = entries.find((l) =>
              l.input_def_id === dl.id && l.report_period_id === urp.id &&
              allResources.some((g) => g.id === l.energy_resource_id && g.service_area_id === sa.id)
            );
            return { ServiceAreaId: sa.id, UtilityId: urp.utility_id, [dl.name]: dlValue(val?.value), ...acc };
          }, {} as Record<string, unknown>)
        ),
      };
    }));
}
