import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { energyResources, serviceAreas } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import {
  resolveDlIds,
  dlValue,
  formatReportPeriodIso,
} from "@/lib/legacy/legacy-dl-resolver";

const trainingIds = {
  ElectricityCustomers: 3213040204,
  ElectricitySoldToCustomers: 3213040220,
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const idMap = await resolveDlIds(Object.values(trainingIds));
  const prismIds = Array.from(idMap.values()).filter(
    (id): id is number => id != null,
  );
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
    .where(isNotNull(reportPeriods.status_id));
  const allSa = await db
    .select()
    .from(serviceAreas)
    .where(
      and(eq(serviceAreas.is_active, true), eq(serviceAreas.is_virtual, false)),
    );
  const allResources = await db
    .select()
    .from(energyResources)
    .where(eq(energyResources.is_virtual, false));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));
  const inputDefs = await db
    .select()
    .from(measureDefinitions)
    .where(
      and(
        inArray(measureDefinitions.id, prismIds),
        eq(measureDefinitions.is_active, true),
      ),
    );

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  return Response.json(
    rps.map((urp) => {
      const reportType = findItem(urp.report_type_id)?.name;
      return {
        ReportType: reportType,
        ReportPeriod: formatReportPeriodIso(urp.report_date, reportType),
        UtilityId: urp.utility_id,
        Data: allSa
          .filter((sa) => sa.utility_id === urp.utility_id)
          .map((sa) => {
            const dataValues = inputDefs.reduce(
              (acc, dl) => {
                const val = entries.find(
                  (l) =>
                    l.measure_def_id === dl.id &&
                    l.report_period_id === urp.id &&
                    allResources.find((g) => g.id === l.energy_resource_id)
                      ?.service_area_id === sa.id,
                )?.value;
                return { ...acc, [dl.name]: dlValue(val) };
              },
              {} as Record<string, unknown>,
            );
            return { ServiceAreaId: sa.id, ...dataValues };
          }),
      };
    }),
  );
}
