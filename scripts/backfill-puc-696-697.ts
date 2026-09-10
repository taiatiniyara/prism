import "dotenv/config";
import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
import { and, eq, inArray } from "drizzle-orm";

const REPORT_PERIOD_ID = 257;
const UNITS = [696, 697];

const DL_DEF_TO_MEASURE_DEF: Record<number, number> = {
  1213146260: 320, // Utility Diesel GEN Installed Capacity
  1213146261: 321, // Utility Diesel GEN Electricity Generated
  1213146265: 331, // Utility Diesel GEN Downtime Planned
  1213146267: 333, // Utility Diesel GEN Downtime Unplanned
  1213146273: 380, // Utility Fuel Oil for Diesel Generators
  1213146276: 381, // Lubrication Oil for Utility Generators
};

async function fetchSourceRows() {
  const base = process.env.PRISM_TRAINING_MIGRATION_URL?.trim() ?? "";
  const key = process.env.PRISM_TRAINING_MIGRATION_KEY?.trim() ?? "";
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (key) headers["x-migration-key"] = key;

  let cursor: number | null = null;
  let hasMore = true;
  const rows: any[] = [];
  while (hasMore) {
    const p = new URLSearchParams();
    p.set("reportPeriodId", String(REPORT_PERIOD_ID));
    p.set("includeDeleted", "1");
    p.set("limit", "2000");
    if (cursor != null) p.set("cursor", String(cursor));
    const url = `${base.replace(/\/$/, "")}/dataEntry?${p.toString()}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(90000) });
    if (!res.ok) throw new Error(`source fetch failed: ${res.status} ${await res.text()}`);
    const body: any = await res.json();
    const page = body?.dataEntry ?? [];
    rows.push(...page.filter((r: any) => UNITS.includes(r.energy_resource_id)));
    cursor = body?.pagination?.nextCursor ?? null;
    hasMore = body?.pagination?.hasMore === true && cursor != null;
    if (page.length === 0) break;
  }
  return rows;
}

async function getSiblingTemplate() {
  const template = await db
    .select()
    .from(dataEntries)
    .where(and(eq(dataEntries.report_period_id, REPORT_PERIOD_ID), eq(dataEntries.unit_id, 306)));
  const byDef = new Map<number, typeof dataEntries.$inferSelect>();
  for (const row of template) byDef.set(row.measure_def_id, row);
  return byDef;
}

function normalizeValue(raw: string | null | undefined, comments: string | null): string | null {
  if (raw == null) return null;
  return raw.trim();
}

async function main() {
  const sourceRows = await fetchSourceRows();
  if (sourceRows.length !== 12) throw new Error(`expected 12 source rows, got ${sourceRows.length}`);

  const templateByDef = await getSiblingTemplate();
  const missing = Object.values(DL_DEF_TO_MEASURE_DEF).filter((def) => !templateByDef.has(def));
  if (missing.length) throw new Error(`missing sibling template defs: ${missing.join(",")}`);

  const existingCount = 0;
  void existingCount;

  const prepared: typeof dataEntries.$inferInsert[] = [];
  for (const src of sourceRows) {
    const measureDefId = DL_DEF_TO_MEASURE_DEF[src.input_def_id as number];
    if (measureDefId == null) {
      console.error(`skip unknown dl_def ${src.input_def_id} (${src.input_def_name}) unit ${src.energy_resource_id}`);
      continue;
    }
    const tpl = templateByDef.get(measureDefId)!;
    const value = normalizeValue(src.value, src.comments);
    const isNotAvailable = src.value == null && (src.comments ?? "").toLowerCase() === "data is not available";
    const commentsArr = src.comments
      ? [{ comment: src.comments, commenterId: "39", commenterRole: "migrated", date: src.updated_at }]
      : null;

    prepared.push({
      report_period_id: REPORT_PERIOD_ID,
      unit_id: src.energy_resource_id,
      asset_class_id: tpl.asset_class_id,
      power_station_id: tpl.power_station_id,
      service_area_id: tpl.service_area_id,
      utility_id: tpl.utility_id,
      country_id: tpl.country_id,
      subregion_id: tpl.subregion_id,
      region: tpl.region,
      measure_def_id: measureDefId,
      value: value == null ? null : null,
      value_text: null,
      value_numeric: value,
      value_boolean: null,
      comments: commentsArr,
      update_medium_id: tpl.update_medium_id,
      status_id: 5,
      no_data_reason: isNotAvailable ? "not_available" : null,
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
    });
  }

  if (prepared.length !== 12) throw new Error(`prepared ${prepared.length} rows (expected 12)`);

  console.log("INSERT", prepared.length, "rows");
  for (const row of prepared) {
    const identical = await db
      .select()
      .from(dataEntries)
      .where(
        and(
          eq(dataEntries.report_period_id, row.report_period_id!),
          eq(dataEntries.unit_id, row.unit_id!),
          eq(dataEntries.measure_def_id, row.measure_def_id!)
        )
      )
      .limit(1);
    if (identical.length === 0) {
      await db.insert(dataEntries).values(row as any);
      console.log(`inserted unit=${row.unit_id} def=${row.measure_def_id} value=${row.value_numeric}`);
    } else {
      console.log(`exists unit=${row.unit_id} def=${row.measure_def_id} value=${identical[0].value_numeric}`);
    }
  }

  const after = await db
    .select()
    .from(dataEntries)
    .where(and(eq(dataEntries.report_period_id, REPORT_PERIOD_ID), inArray(dataEntries.unit_id, UNITS)));
  console.log("total 696/697 rows now:", after.length);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });