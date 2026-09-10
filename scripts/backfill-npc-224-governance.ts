import "dotenv/config";
import { db } from "@/db/connection";
import { dataEntries, DataEntryStatusId } from "@/db/schema/dataEntry";
import { eq, and, inArray } from "drizzle-orm";

const REPORT_PERIOD_ID = 224;
const UTILITY_ID = 17; // NPC

// training_dl_def_id -> prism measure_def_id (group 203).
const TRAINING_DL_TO_MEASURE: Record<number, number> = {
  4213040046: 100, // Are Ministers or Public Servants representing the line/sector Ministry appointed
  4213040045: 101,
  4213040035: 102,
  4213040036: 103,
  4213040040: 104,
  4213040041: 105,
  4213040055: 106,
  4213040056: 107,
  4213040057: 108,
  4213040050: 109,
  4213040051: 110,
  4213040030: 111,
  4213040031: 112,
  4213040032: 113,
};

// The single dimension signature the extract loader used for governance rows.
const DIMS = {
  provider_id: 21, // Utility
  category_id: 30, // All
  technology_id: 40, // All
  asset_class_id: 983, // All
  customer_type_id: 690, // All
  payment_mode_id: 720, // All
  consumption_band_id: 1005, // All
  division_id: 1011, // All
  gender_id: 1022, // All
  utility_function_id: 1023, // All
};

function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "y" || s === "t";
}

async function fetchSourceRows() {
  const base = process.env.PRISM_TRAINING_MIGRATION_URL?.trim() ?? "";
  const key = process.env.PRISM_TRAINING_MIGRATION_KEY?.trim() ?? "";
  const params = new URLSearchParams({
    reportPeriodId: String(REPORT_PERIOD_ID),
    limit: "2000",
    includeDeleted: "1",
  });
  const res = await fetch(`${base.replace(/\/$/, "")}/dataEntry?${params}`, {
    headers: { "x-migration-key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`source fetch failed: ${res.status} ${await res.text()}`);
  const body: any = await res.json();
  return (body?.dataEntry ?? []) as any[];
}

async function main() {
  const sourceRows = await fetchSourceRows();
  const gov = sourceRows.filter((r) => TRAINING_DL_TO_MEASURE[r.input_def_id as number] != null);
  console.log(`source rows at rp224: ${sourceRows.length}, governance: ${gov.length}`);

  let inserted = 0;
  let skipped = 0;
  for (const src of gov) {
    const measureDefId = TRAINING_DL_TO_MEASURE[src.input_def_id as number];
    const existing = await db
      .select()
      .from(dataEntries)
      .where(
        and(
          eq(dataEntries.report_period_id, REPORT_PERIOD_ID),
          eq(dataEntries.measure_def_id, measureDefId),
          eq(dataEntries.utility_id, UTILITY_ID),
          eq(dataEntries.is_deleted, false),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      skipped++;
      console.log(`exists def=${measureDefId} (${existing[0].value_boolean})`);
      continue;
    }
    const valueBoolean = src.data_not_available ? false : coerceBoolean(src.value);
    await db.insert(dataEntries).values({
      report_period_id: REPORT_PERIOD_ID,
      measure_def_id: measureDefId,
      utility_id: UTILITY_ID,
      service_area_id: null,
      unit_id: null,
      ...DIMS,
      value_boolean: valueBoolean,
      status_id: DataEntryStatusId.Entered,
      no_data_reason: src.data_not_available ? "not_available" : null,
      is_relevant: true,
      is_deleted: false,
      comments: [
        {
          comment: "backfilled from legacy governance migration parity (FactGovernance)",
          commenterId: "39",
          commenterRole: "migrated",
          date: new Date().toISOString(),
        },
      ],
      updatedAt: new Date(),
      updatedById: "39",
    } as any);
    inserted++;
    console.log(`inserted def=${measureDefId} value=${valueBoolean}`);
  }
  console.log(`INSERTED ${inserted}, SKIPPED(existing) ${skipped} of ${gov.length}`);

  const after = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.report_period_id, REPORT_PERIOD_ID),
        eq(dataEntries.utility_id, UTILITY_ID),
        inArray(
          dataEntries.measure_def_id,
          Object.values(TRAINING_DL_TO_MEASURE),
        ),
      ),
    );
  console.log("NPC rp224 governance rows now:", after.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});