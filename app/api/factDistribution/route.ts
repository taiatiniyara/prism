import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { energyResources, serviceAreas } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { resolveDlIds, dlValue, formatReportPeriodIso } from "@/lib/legacy-dl-resolver";

const trainingIds = {
  DistributionTransformersCapacity: 3213040224,
  DistributionNetworkLength: 3213040223,
  DistributionUnplannedDowntimeEvents: 3213040228,
  FteEmployeesDistribution: 3213040176,
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json({ message: authorize.message }, { status: 401 });

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

  return Response.json(rps.map((urp) => {
    const rpGens = allResources.filter((g) => g.period_entries?.some((pe) => pe.report_period_id === urp.id));
    const reportType = findItem(urp.report_type_id)?.name;
    return {
      ReportType: reportType,
      ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
      UtilityId: urp.utility_id,
      Data: allSa.filter((sa) => sa.utility_id === urp.utility_id).map((sa) => {
        return inputDefs.reduce((acc, dl) => {
          const val = entries.find((l) =>
            l.input_def_id === dl.id && l.report_period_id === urp.id &&
            rpGens.find((g) => g.id === l.energy_resource_id && g.service_area_id === sa.id)
          );
          return { ServiceAreaId: sa.id, [dl.name]: dlValue(val?.value), ...acc };
        }, {} as Record<string, unknown>);
      }),
    };
  }));
}
