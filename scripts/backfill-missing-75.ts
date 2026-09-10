import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
import { and, eq, inArray } from "drizzle-orm";

const CAND = "C:\\Users\\codec\\AppData\\Local\\Temp\\opencode\\cand.json";
const cand: {
  rp: number;
  unit: number;
  def: number;
  label: string;
  value: string;
  kind: string;
  utility: string;
  year: number;
}[] = JSON.parse(readFileSync(CAND, "utf8"));

async function loadTemplates(rps: number[], units: number[]) {
  const rows = await db
    .select()
    .from(dataEntries)
    .where(and(inArray(dataEntries.report_period_id, rps), inArray(dataEntries.unit_id, units)));
  const byUnitPeriod: Map<string, typeof dataEntries.$inferSelect[]> = new Map();
  for (const row of rows) {
    const key = `${row.report_period_id}|${row.unit_id}`;
    const arr = byUnitPeriod.get(key) ?? [];
    arr.push(row);
    byUnitPeriod.set(key, arr);
  }
  return byUnitPeriod;
}

async function pickTemplate(byUnitPeriod: Map<string, typeof dataEntries.$inferSelect[]>, rp: number, unit: number) {
  const rows = byUnitPeriod.get(`${rp}|${unit}`) ?? [];
  if (rows.length === 0) throw new Error(`no template rows for rp=${rp} unit=${unit}`);
  return (
    rows.find((r) => r.measure_def_id === 331) ??
    rows.find((r) => r.measure_def_id === 360) ??
    rows[0]
  );
}

async function main() {
  const rps = [...new Set(cand.map((c) => c.rp))];
  const units = [...new Set(cand.map((c) => c.unit))];
  const byUnitPeriod = await loadTemplates(rps, units);

  let inserted = 0;
  let skipped = 0;
  for (const c of cand) {
    const existing = await db
      .select()
      .from(dataEntries)
      .where(
        and(
          eq(dataEntries.report_period_id, c.rp),
          eq(dataEntries.unit_id, c.unit),
          eq(dataEntries.measure_def_id, c.def),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    const tpl = await pickTemplate(byUnitPeriod, c.rp, c.unit);
    await db.insert(dataEntries).values({
      report_period_id: c.rp,
      unit_id: c.unit,
      asset_class_id: tpl.asset_class_id,
      power_station_id: tpl.power_station_id,
      service_area_id: tpl.service_area_id,
      utility_id: tpl.utility_id,
      country_id: tpl.country_id,
      subregion_id: tpl.subregion_id,
      region: tpl.region,
      measure_def_id: c.def,
      value: null,
      value_text: null,
      value_numeric: String(c.value),
      value_boolean: null,
      comments: [{ comment: "backfilled from legacy migration parity (FactGenData)", commenterId: "39", commenterRole: "migrated", date: new Date().toISOString() }],
      update_medium_id: tpl.update_medium_id,
      status_id: 5,
      no_data_reason: null,
      is_relevant: true,
      is_deleted: false,
      provider_id: tpl.provider_id,
      category_id: tpl.category_id,
      technology_id: tpl.technology_id,
      customer_type_id: tpl.customer_type_id,
      payment_mode_id: tpl.payment_mode_id,
      consumption_band_id: tpl.consumption_band_id,
      division_id: tpl.division_id,
      gender_id: tpl.gender_id,
      utility_function_id: tpl.utility_function_id,
      value_option_id: tpl.value_option_id,
      multiplier: tpl.multiplier,
      updatedAt: new Date(),
      updatedById: "39",
    } as any);
    inserted++;
    console.log(`inserted rp=${c.rp} unit=${c.unit} def=${c.def} value=${c.value} (${c.label})`);
  }
  console.log(`INSERTED ${inserted}, SKIPPED(existing) ${skipped} of ${cand.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});