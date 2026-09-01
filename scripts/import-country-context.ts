import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(file: string) {
  let raw: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(resolve(".env"));
loadEnv(resolve(".env.local"));

const DUMP_PATH =
  process.env.TRAINING_CC_DATA_JSON ?? resolve("training-country-context.json");

const STATUS_ENTERED = 3;
const STATUS_NOT_AVAILABLE = 7;

type DumpRow = {
  utility_report_period_id: number;
  country_iso3: string | null;
  dl_def_id: number;
  dl_value: string | null;
  data_not_available: boolean;
  is_deleted: boolean;
  updated_date: string | null;
};

async function main() {
  const { db } = await import("@/db/connection");
  const { dataEntries, measureDefinitions, inputDlDefMappings } = await import(
    "@/db/schema/dataEntry"
  );
  const { countries } = await import("@/db/schema/country");
  const { reportPeriods } = await import("@/db/schema/reportPeriods");
  const { managedListItems } = await import("@/db/schema/managedLists");
  const { inArray } = await import("drizzle-orm");
  const { resolveValueColumn } = await import("@/lib/data-entry/value-router");
  const { getDimensionDefaults } = await import(
    "@/lib/data-entry/dimension-defaults"
  );

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const rows = JSON.parse(readFileSync(DUMP_PATH, "utf8")) as DumpRow[];

  const defs = await db
    .select({
      id: measureDefinitions.id,
      data_type_id: measureDefinitions.data_type_id,
    })
    .from(measureDefinitions);
  const maps = await db.select().from(inputDlDefMappings);
  const countriesList = await db
    .select({ id: countries.id, iso3: countries.iso_code_alpha3 })
    .from(countries);
  const rps = await db.select({ id: reportPeriods.id }).from(reportPeriods);
  const items = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems);

  const measureDataTypes = new Map(defs.map((d) => [d.id, d.data_type_id]));
  const dlToMeasure = new Map(
    maps.map((m) => [m.training_dl_def_id, m.measure_def_id]),
  );
  const countryIdByIso3 = new Map(
    countriesList.map((c) => [c.iso3.toUpperCase(), c.id]),
  );
  const reportPeriodIds = new Set(rps.map((r) => r.id));
  const dataTypeById = new Map(items.map((i) => [i.id, i.name]));
  const itemIdByName = new Map(
    items.map((i) => [i.name.trim().toLowerCase(), i.id]),
  );
  const dims = await getDimensionDefaults();

  const subgroupMeasureIds = new Set(defs.map((d) => d.id));
  const existingRows = await db
    .select({
      report_period_id: dataEntries.report_period_id,
      measure_def_id: dataEntries.measure_def_id,
      country_id: dataEntries.country_id,
    })
    .from(dataEntries)
    .where(inArray(dataEntries.measure_def_id, [...subgroupMeasureIds]));
  const existingKeys = new Set(
    existingRows.map(
      (e) => `${e.report_period_id}:${e.measure_def_id}:${e.country_id}`,
    ),
  );

  const payloads: Record<string, unknown>[] = [];
  let skippedNoMapping = 0;
  let skippedNoPeriod = 0;
  let skippedNoCountry = 0;
  let skippedExisting = 0;

  for (const row of rows) {
    if (!reportPeriodIds.has(row.utility_report_period_id)) {
      skippedNoPeriod++;
      continue;
    }
    const measureId = dlToMeasure.get(row.dl_def_id);
    if (measureId == null) {
      skippedNoMapping++;
      continue;
    }
    const countryId = row.country_iso3
      ? countryIdByIso3.get(row.country_iso3.toUpperCase()) ?? null
      : null;
    if (countryId == null) {
      skippedNoCountry++;
      continue;
    }

    const key = `${row.utility_report_period_id}:${measureId}:${countryId}`;
    if (existingKeys.has(key)) {
      skippedExisting++;
      continue;
    }
    existingKeys.add(key);

    const dataTypeName = dataTypeById.get(
      measureDataTypes.get(measureId) ?? -1,
    );
    const column = resolveValueColumn(dataTypeName);
    const valueField: Record<string, unknown> = {};
    if (row.dl_value != null) {
      if (column === "value_numeric") {
        const n = Number(row.dl_value);
        valueField.value_numeric = Number.isFinite(n) ? n : null;
      } else if (column === "value_boolean") {
        valueField.value_boolean =
          row.dl_value === "true" ||
          row.dl_value === "1" ||
          row.dl_value === "yes";
      } else if (column === "value_option_id") {
        valueField.value_option_id =
          itemIdByName.get(row.dl_value.trim().toLowerCase()) ?? null;
      } else {
        valueField.value_text = row.dl_value;
      }
    }

    payloads.push({
      report_period_id: row.utility_report_period_id,
      measure_def_id: measureId,
      country_id: countryId,
      service_area_id: null,
      unit_id: null,
      provider_id: dims.energyProvider,
      technology_id: dims.energySource,
      category_id: dims.energyType,
      asset_class_id: dims.unitType,
      customer_type_id: dims.customerType,
      payment_mode_id: dims.paymentMode,
      consumption_band_id: dims.consumptionBand,
      division_id: dims.division,
      gender_id: dims.gender,
      utility_function_id: dims.utilityFunction,
      ...valueField,
      status_id:
        row.data_not_available ? STATUS_NOT_AVAILABLE : STATUS_ENTERED,
      is_relevant: true,
      is_deleted: row.is_deleted,
      updated_by_id: null,
      updated_at: row.updated_date ? new Date(row.updated_date) : new Date(),
    });
  }

  let inserted = 0;
  for (let i = 0; i < payloads.length; i += 500) {
    const chunk = payloads.slice(i, i + 500);
    await db.insert(dataEntries).values(chunk);
    inserted += chunk.length;
    process.stderr.write(`  inserted ${inserted}/${payloads.length}\n`);
  }

  console.log(
    `inserted=${inserted} skippedNoMapping=${skippedNoMapping} skippedNoPeriod=${skippedNoPeriod} skippedNoCountry=${skippedNoCountry} skippedExisting=${skippedExisting}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
