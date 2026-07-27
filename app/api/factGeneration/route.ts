import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { units, serviceAreas } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedLists, managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import {
  resolveDlIds,
  formatReportPeriodIso,
  dlValue,
} from "@/lib/legacy/legacy-dl-resolver";

const TrainingDlIds = {
  ElectricityDemandAverageLoad: 3213040221,
  ElectricityDemandPeakLoad: 3213040222,
  FteEmployeesGeneration: 3213040175,
  GeneratedElectricityConsumedInternally: 3213040262,
} as const;

const TRAINING_IDS = Object.values(TrainingDlIds);

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) {
    return Response.json({ message: authorize.message }, { status: 401 });
  }

  const idMap = await resolveDlIds(TRAINING_IDS);
  const prismIds = Array.from(idMap.values()).filter(
    (id): id is number => id != null,
  );

  if (prismIds.length === 0) {
    return Response.json([]);
  }

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

  const allServiceAreas = await db
    .select()
    .from(serviceAreas)
    .where(eq(serviceAreas.is_active, true));

  const allResources = await db
    .select()
    .from(units)
    .where(eq(units.is_virtual, false));

  const allManagedItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const allManagedLists = await db
    .select()
    .from(managedLists)
    .where(eq(managedLists.is_active, true));

  function findManagedList(id: number | null) {
    if (!id) return undefined;
    return allManagedItems.find(
      (m) => m.id === id && allManagedLists.some((l) => l.id === m.list_id),
    );
  }

  const avgLoadId = idMap.get(TrainingDlIds.ElectricityDemandAverageLoad);
  const peakLoadId = idMap.get(TrainingDlIds.ElectricityDemandPeakLoad);
  const fteGenId = idMap.get(TrainingDlIds.FteEmployeesGeneration);
  const consumedInternallyId = idMap.get(
    TrainingDlIds.GeneratedElectricityConsumedInternally,
  );

  const relevantDlIds = [avgLoadId, peakLoadId, fteGenId].filter(
    (id): id is number => id != null,
  );

  const inputDefs = await db
    .select()
    .from(measureDefinitions)
    .where(
      and(
        inArray(measureDefinitions.id, relevantDlIds),
        eq(measureDefinitions.is_active, true),
      ),
    );

  return Response.json(
    rps.map((urp) => {
      const rpGens = allResources.filter((gen) =>
        gen.period_entries?.some((pe) => pe.report_period_id === urp.id),
      );

      const reportType = findManagedList(urp.report_type_id)?.name;
      const reportDate = formatReportPeriodIso(urp.report_date, reportType);

      const data = allServiceAreas
        .filter((sa) => sa.utility_id === urp.utility_id && !sa.is_virtual)
        .map((sa) => {
          const dataValues = inputDefs.reduce((acc, dl) => {
            const val = entries.find((l) => {
              const gen = rpGens.find((g) => g.id === l.unit_id);
              return (
                l.measure_def_id === dl.id &&
                l.report_period_id === urp.id &&
                gen?.service_area_id === sa.id
              );
            });
            return {
              ServiceAreaId: sa.id,
              [dl.name]: dlValue(val?.value),
              ...acc,
            };
          }, {});

          const eci = entries.find(
            (l) =>
              l.measure_def_id === consumedInternallyId &&
              l.report_period_id === urp.id &&
              rpGens.some(
                (g) =>
                  g.id === l.unit_id && g.service_area_id === sa.id,
              ),
          );

          return {
            ...dataValues,
            "Gen Electricity Consumed Internally": eci
              ? Number(eci.value)
              : null,
          };
        });

      return {
        "Report Type": reportType,
        "Report Period": reportDate,
        UtilityId: urp.utility_id,
        Data: data,
      };
    }),
  );
}
