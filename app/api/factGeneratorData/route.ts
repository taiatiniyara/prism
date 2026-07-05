import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
import { energyResources } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { resolveDlIds, dlValue, formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";

const trainingIds = {
  TotalHoursInPeriod: 4213040270,
  GeneratorElectrictyGenerated: 261,
  GeneratorElectritySentToGrid: 263,
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false) return Response.json({ message: authorize.message }, { status: 401 });

  const idMap = await resolveDlIds(Object.values(trainingIds));
  const totalHoursId = idMap.get(trainingIds.TotalHoursInPeriod);
  const allDlIds = Array.from(idMap.values()).filter((id): id is number => id != null);
  if (allDlIds.length === 0) return Response.json([]);

  const entries = await db.select().from(dataEntries).where(and(inArray(dataEntries.input_def_id, allDlIds), eq(dataEntries.is_deleted, false)));
  const rps = await db.select().from(reportPeriods).where(isNotNull(reportPeriods.status_id));
  const allResources = await db.select().from(energyResources).where(eq(energyResources.is_virtual, false));
  const allItems = await db.select().from(managedListItems).where(eq(managedListItems.is_active, true));

  function findItem(id: number | null) { return id ? allItems.find((m) => m.id === id) : undefined; }

  return Response.json(rps
    .filter((urp) => allResources.some((g) => g.period_entries?.some((pe) => pe.report_period_id === urp.id) && entries.some((de) => de.energy_resource_id === g.id && de.report_period_id === urp.id)))
    .map((urp) => {
      const rpGens = allResources.filter((gen) =>
        gen.period_entries?.some((pe) => pe.report_period_id === urp.id) &&
        entries.some((de) => de.energy_resource_id === gen.id && de.report_period_id === urp.id) &&
        !gen.name.includes("Virtual")
      );
      const totalHours = entries.find((d) => d.input_def_id === totalHoursId && d.report_period_id === urp.id);
      const reportType = findItem(urp.report_type_id)?.name;
      return {
        "Utility Report Period ID": urp.id,
        "Report Type": reportType,
        "Report Date": formatReportPeriodIso(urp.report_date, reportType),
        "Utility ID": urp.utility_id,
        "Generator Data": rpGens.map((g) => {
          const genEntries = entries.filter((d) => d.report_period_id === urp.id && d.energy_resource_id === g.id);
          return {
            ServiceAreaId: g.service_area_id,
            GeneratorId: g.id,
            GeneratorName: g.name,
            EnergyProvider: findItem(g.energy_provider_id)?.name,
            EnergyType: findItem(g.energy_type_id)?.name,
            EnergySource: findItem(g.energy_source_id)?.name,
            "Total Hours in Period": Number(totalHours?.value),
            ...genEntries.reduce((acc, e) => {
              const item = allItems.find((m) => m.id === e.input_def_id);
              return { [item?.name ?? ""]: dlValue(e.value), ...acc };
            }, {} as Record<string, unknown>),
          };
        }),
      };
    }));
}
