import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { units } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";
import { buildParentMap, categoryFromTechnology } from "@/lib/energy-taxonomy";

const GENERATOR_MEASURE_NAMES = [
  "Hours in Period",
  "Electricity Generated",
  "Electricity Sent to Grid",
] as const;

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.name, [...GENERATOR_MEASURE_NAMES]));

  const totalHoursId = measureDefs.find(
    (m) => m.name === "Hours in Period",
  )?.id;
  const allDlIds = measureDefs.map((m) => m.id);
  if (allDlIds.length === 0) return Response.json([]);

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
  const allResources = await db
    .select()
    .from(units)
    .where(eq(units.is_virtual, false));
  const allItems = await db
    .select()
    .from(managedListItems)
    .where(eq(managedListItems.is_active, true));

  const { dataTypeNameById, itemsById } = await getValueResolutionContext(
    allDlIds,
  );

  const parentById = buildParentMap(allItems);

  function findItem(id: number | null) {
    return id ? allItems.find((m) => m.id === id) : undefined;
  }

  function valueFor(entry: (typeof entries)[number] | undefined) {
    return resolveEntryValue(
      entry,
      dataTypeNameById.get(entry?.measure_def_id ?? -1) ?? null,
      itemsById,
    );
  }

  return Response.json(
    rps
      .filter((urp) =>
        allResources.some(
          (g) =>
            g.period_entries?.some((pe) => pe.report_period_id === urp.id) &&
            entries.some(
              (de) =>
                de.unit_id === g.id &&
                de.report_period_id === urp.id,
            ),
        ),
      )
      .map((urp) => {
        const rpGens = allResources.filter(
          (gen) =>
            gen.period_entries?.some((pe) => pe.report_period_id === urp.id) &&
            entries.some(
              (de) =>
                de.unit_id === gen.id &&
                de.report_period_id === urp.id,
            ) &&
            !gen.name.includes("Virtual"),
        );
        const totalHours = entries.find(
          (d) =>
            d.measure_def_id === totalHoursId && d.report_period_id === urp.id,
        );
        const reportType = findItem(urp.report_type_id)?.name;
        return {
          "Utility Report Period ID": urp.id,
          "Report Type": reportType,
          "Report Date": formatReportPeriodIso(urp.report_date, reportType),
          "Utility ID": urp.utility_id,
          "Generator Data": rpGens.map((g) => {
            const genEntries = entries.filter(
              (d) =>
                d.report_period_id === urp.id && d.unit_id === g.id,
            );
            return {
              ServiceAreaId: g.service_area_id,
              GeneratorId: g.id,
              GeneratorName: g.name,
              EnergyProvider: findItem(g.provider_id)?.name,
              EnergyType: findItem(categoryFromTechnology(g.technology_id, parentById))?.name,
              EnergySource: findItem(g.technology_id)?.name,
              "Total Hours in Period": Number(valueFor(totalHours)),
              ...genEntries.reduce(
                (acc, e) => {
                  const def = measureDefs.find((m) => m.id === e.measure_def_id);
                  return { [def?.name ?? ""]: valueFor(e), ...acc };
                },
                {} as Record<string, unknown>,
              ),
            };
          }),
        };
      }),
  );
}
