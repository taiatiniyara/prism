import { db } from "@/db/connection";
import { dataEntries, measureDefinitions } from "@/db/schema/dataEntry";
import { units } from "@/db/schema/utility";
import { reportPeriods, publishedPeriodCondition } from "@/db/schema/reportPeriods";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and, inArray } from "drizzle-orm";
import { authorizeApiKey } from "../service";
import { formatReportPeriodIso } from "@/lib/legacy/legacy-dl-resolver";
import {
  resolveEntryValue,
  getValueResolutionContext,
} from "@/lib/legacy/entry-value";
import { buildParentMap, categoryFromTechnology } from "@/lib/energy-taxonomy";

const GENERATOR_MEASURE_NAMES = [
  "Electricity Generated",
  "Electricity Sent to Grid",
  "Rated Capacity",
  "Fuel Oil",
  "Lubrication Oil",
  "Equipment Planned Downtime Hours",
  "Equipment Unplanned Downtime Hours",
  "Solar Hours of Irradiance (H_irradiance)",
  "Solar Average measured irradiance (G_measured)",
  "Solar Standard Test Condition irradiance (G_STC)",
  "Solar Electricity Generated Theoretical",
] as const;

// Power BI column labels (measure name -> semantic-model column name).
const GENERATOR_COLUMN_LABELS: Record<string, string> = {
  "Electricity Generated": "GEN Electricity Generated",
  "Rated Capacity": "GEN Installed Capacity",
  "Equipment Planned Downtime Hours": "GEN Downtime Planned Hours",
  "Equipment Unplanned Downtime Hours": "GEN Downtime Unplanned Hours",
  "Lubrication Oil": "Lubrication Oil",
};

// Emission order (after the six identity columns) mirrors prism-training's
// /api/factGeneratorData, which lists measures in this exact sequence. The
// solar set comes first so every solar row exposes the full shared solar
// column set (null-filled below), then fuel/lubrication, then the pinned GEN
// group. Labels not present for a generator fall through; any provider/
// technology-specific extras append after the pinned ones.
const GENERATOR_COLUMN_ORDER = [
  "G_STC",
  "G_measured",
  "H_irradiance",
  "Solar Energy output max Theoretical",
  "Lubrication Oil",
  "Fuel Oil for Diesel Generators",
  "Fuel Oil for Heavy Fuel Generators",
  "GEN Downtime Unplanned Hours",
  "GEN Downtime Planned Hours",
  "GEN Electricity Generated",
  "GEN Installed Capacity",
];

// Solar measures emit to a single provider-agnostic column name (H_irradiance,
// G_measured, G_STC, Solar Energy output max Theoretical), mirroring how fuel
// oil is already split by technology only. The EnergyProvider identity column
// on each row distinguishes Utility vs IPP.
const SOLAR_COLUMN_SUFFIX: Record<string, string> = {
  "Solar Hours of Irradiance (H_irradiance)": "H_irradiance",
  "Solar Average measured irradiance (G_measured)": "G_measured",
  "Solar Standard Test Condition irradiance (G_STC)": "G_STC",
  "Solar Electricity Generated Theoretical": "Solar Energy output max Theoretical",
};

// "Fuel Oil" is split by technology in the semantic model. Solar generators
// emit no fuel-oil column (mirrors prism-training, where solar never carries
// a fuel measure), so Solar is absent from this map.
const FUEL_OIL_LABEL_BY_TECHNOLOGY: Record<string, string> = {
  Diesel: "Fuel Oil for Diesel Generators",
  "Heavy Fuel": "Fuel Oil for Heavy Fuel Generators",
};

export async function GET(req: Request) {
  const authorize = await authorizeApiKey(req);
  if (authorize.success === false)
    return Response.json({ message: authorize.message }, { status: 401 });

  const measureDefs = await db
    .select()
    .from(measureDefinitions)
    .where(inArray(measureDefinitions.name, [...GENERATOR_MEASURE_NAMES]));

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
    .where(publishedPeriodCondition);
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
        const reportType = findItem(urp.report_type_id)?.name;
        return {
          "Utility Report Period ID": urp.id,
          ReportPeriodId: urp.id,
          "Report Type": reportType,
          "Report Date": formatReportPeriodIso(urp.report_date, reportType),
          "Utility ID": urp.utility_id,
          "Generator Data": rpGens.map((g) => {
            const genEntries = entries.filter(
              (d) =>
                d.report_period_id === urp.id && d.unit_id === g.id,
            );
            const energySource = findItem(g.technology_id)?.name ?? "";
            const measures = genEntries.reduce(
              (acc, e) => {
                const def = measureDefs.find((m) => m.id === e.measure_def_id);
                if (!def) return acc;
                const techName = energySource;
                const solarSuffix = SOLAR_COLUMN_SUFFIX[def.name];
                const label =
                  def.name === "Fuel Oil"
                    ? (FUEL_OIL_LABEL_BY_TECHNOLOGY[techName] ?? def.name)
                    : solarSuffix
                      ? solarSuffix
                      : (GENERATOR_COLUMN_LABELS[def.name] ?? def.name);
                return { [label]: valueFor(e), ...acc };
              },
              {} as Record<string, unknown>,
            );
            // Every solar generator exposes exactly the shared solar column set
            // (the four irradiance/theoretical measures plus the GEN group),
            // null-filled where a period has no entry, and never leaks a fuel
            // or lubrication column. This mirrors prism-training's
            // catalogue-driven emission so both feeds share one column
            // signature per technology.
            if (energySource === "Solar") {
              const solarKeys = [
                ...Object.values(SOLAR_COLUMN_SUFFIX),
                "GEN Downtime Unplanned Hours",
                "GEN Downtime Planned Hours",
                "GEN Electricity Generated",
                "GEN Installed Capacity",
              ];
              for (const key of Object.keys(measures)) {
                if (!solarKeys.includes(key)) delete measures[key];
              }
              for (const key of solarKeys) {
                if (!(key in measures)) measures[key] = null;
              }
            }
            const ordered: Record<string, unknown> = {};
            for (const col of GENERATOR_COLUMN_ORDER) {
              if (col in measures) ordered[col] = measures[col];
            }
            for (const col of Object.keys(measures)) {
              if (!(col in ordered)) ordered[col] = measures[col];
            }
            return {
              ServiceAreaId: g.service_area_id,
              GeneratorId: g.id,
              GeneratorName: g.name,
              EnergyProvider: findItem(g.provider_id)?.name,
              EnergyType: findItem(categoryFromTechnology(g.technology_id, parentById))?.name,
              EnergySource: findItem(g.technology_id)?.name,
...ordered,
            };
          }),
        };
      }),
  );
}
