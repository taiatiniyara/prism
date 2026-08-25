/**
 * Fix governance booleans loaded flat-false from the p1 extract (2026-08-25).
 *
 * Root cause: the p1 source stores governance answers as "Yes"/"No" strings, but
 * the extract loader's coerce() only accepted "true"/"1", so every governance row
 * (measures 100–113) landed as value_boolean = false.
 *
 * This re-reads the governance slice from the prism-training data-entry feed
 * (/migration/dataEntry) and upserts the correct boolean IN PLACE — matching the
 * exact dimension signature the extract loader used (provider=Utility, all other
 * dims All, service_area/unit NULL) so the uniq_entry_address hits the existing
 * rows instead of duplicating them.
 *
 * Measure 100 ("Are line/sector Ministers…") has no input_dl_def_mappings row;
 * its training dl id (4213040046) was resolved by name from /migration/dlDef and
 * is pinned here.
 *
 *   npx tsx scripts/fix-governance-booleans-from-training.ts --dry-run
 *   npx tsx scripts/fix-governance-booleans-from-training.ts
 */
import "dotenv/config";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import {
  dataEntries,
  DataEntryStatusId,
} from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";

const DRY_RUN = process.argv.includes("--dry-run");

const MIG_URL = process.env.PRISM_TRAINING_MIGRATION_URL;
const MIG_KEY = process.env.PRISM_TRAINING_MIGRATION_KEY;

// training_dl_def_id -> measure_def_id (13 mappings from input_dl_def_mappings,
// plus measure 100 resolved by name from /migration/dlDef).
const TRAINING_DL_TO_MEASURE: Record<number, number> = {
  4213040046: 100,
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

// The single dimension signature the extract loader used for governance rows
// (verified against data_entries: one signature across all 1078 rows).
// NB: keys must be the schema's JS property names (snake_case), not TS-style.
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

type SourceRow = {
  source_id: number;
  report_period_id: number;
  input_def_id: number;
  value: string | null;
  data_not_available: boolean;
  is_deleted: boolean;
};

function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "y" || s === "t";
}

async function fetchGovernanceRows(): Promise<SourceRow[]> {
  if (!MIG_URL || !MIG_KEY) {
    throw new Error(
      "PRISM_TRAINING_MIGRATION_URL / PRISM_TRAINING_MIGRATION_KEY are not configured.",
    );
  }
  const wanted = new Set(Object.keys(TRAINING_DL_TO_MEASURE).map(Number));
  const out: SourceRow[] = [];
  let cursor: number | null = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({ limit: "500", includeDeleted: "1" });
    if (cursor != null) params.set("cursor", String(cursor));
    const res = await fetch(`${MIG_URL}/dataEntry?${params}`, {
      headers: { "x-migration-key": MIG_KEY },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`dataEntry feed HTTP ${res.status}`);
    const page = (await res.json()) as {
      dataEntry: SourceRow[];
      pagination?: { nextCursor?: number; hasMore?: boolean };
    };
    for (const r of page.dataEntry ?? []) {
      if (wanted.has(r.input_def_id)) out.push(r);
    }
    process.stdout.write(`  scanned ${out.length > 0 ? "+" : ""}${(page.dataEntry ?? []).length} rows (gov so far: ${out.length})\n`);
    cursor = page.pagination?.nextCursor ?? null;
    hasMore = page.pagination?.hasMore === true && cursor != null;
  }
  return out;
}

async function main() {
  const sourceRows = await fetchGovernanceRows();
  console.log(`fetched ${sourceRows.length} governance rows from training`);

  const rpRows = await db
    .select({ id: reportPeriods.id, utilityId: reportPeriods.utility_id })
    .from(reportPeriods);
  const utilityByPeriod = new Map(rpRows.map((r) => [r.id, r.utilityId]));

  // De-duplicate source on (report_period_id, measure) — last write wins, mirroring
  // the source's own change_ref ordering.
  const byAddress = new Map<string, SourceRow>();
  for (const r of sourceRows) {
    const measureId = TRAINING_DL_TO_MEASURE[r.input_def_id];
    const key = `${r.report_period_id}:${measureId}`;
    byAddress.set(key, r);
  }
  console.log(`distinct addresses: ${byAddress.size}`);

  let missingPeriod = 0;
  const planned: {
    reportPeriodId: number;
    utilityId: number;
    measureDefId: number;
    valueBoolean: boolean;
    sourceId: number;
  }[] = [];

  for (const [, r] of byAddress) {
    const measureDefId = TRAINING_DL_TO_MEASURE[r.input_def_id];
    const utilityId = utilityByPeriod.get(r.report_period_id);
    if (utilityId == null) {
      missingPeriod += 1;
      continue;
    }
    if (r.is_deleted) continue; // nothing deleted in the source today
    planned.push({
      reportPeriodId: r.report_period_id,
      utilityId,
      measureDefId,
      valueBoolean: r.data_not_available ? false : coerceBoolean(r.value),
      sourceId: r.source_id,
    });
  }
  if (missingPeriod > 0) {
    console.warn(`skipped ${missingPeriod} rows: report period not in PRISM`);
  }

  const yesCount = planned.filter((p) => p.valueBoolean).length;
  console.log(
    `planned upserts: ${planned.length} (true=${yesCount}, false=${planned.length - yesCount})`,
  );

  // Snapshot current state before writing.
  if (!DRY_RUN) {
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS backup.gov_pre_bool_fix_20260825 AS
        SELECT * FROM data_entries WHERE measure_def_id BETWEEN 100 AND 113`,
    );
    console.log("snapshot written: backup.gov_pre_bool_fix_20260825");
  }

  const measureIds = Object.values(TRAINING_DL_TO_MEASURE);
  let updated = 0;
  let inserted = 0;
  const failures: { address: string; error: string }[] = [];

  const describeError = (e: unknown): string => {
    const err = e as { cause?: { detail?: string; constraint?: string; code?: string }; message?: string };
    const c = err.cause;
    return [err.message?.split("\n")[0], c?.detail, c?.constraint]
      .filter(Boolean)
      .join(" | ");
  };

  for (const p of planned) {
    const address = `rp=${p.reportPeriodId} m=${p.measureDefId} u=${p.utilityId}`;
    try {
    const [existing] = await db
      .select({ id: dataEntries.id })
      .from(dataEntries)
      .where(
        and(
          eq(dataEntries.report_period_id, p.reportPeriodId),
          eq(dataEntries.measure_def_id, p.measureDefId),
          eq(dataEntries.utility_id, p.utilityId),
          isNull(dataEntries.service_area_id),
          isNull(dataEntries.unit_id),
          eq(dataEntries.provider_id, DIMS.provider_id),
          eq(dataEntries.category_id, DIMS.category_id),
          eq(dataEntries.technology_id, DIMS.technology_id),
          eq(dataEntries.asset_class_id, DIMS.asset_class_id),
          eq(dataEntries.customer_type_id, DIMS.customer_type_id),
          eq(dataEntries.payment_mode_id, DIMS.payment_mode_id),
          eq(dataEntries.consumption_band_id, DIMS.consumption_band_id),
          eq(dataEntries.division_id, DIMS.division_id),
          eq(dataEntries.gender_id, DIMS.gender_id),
          eq(dataEntries.utility_function_id, DIMS.utility_function_id),
        ),
      )
      .limit(1);

    if (DRY_RUN) {
      if (existing) updated += 1;
      else inserted += 1;
      continue;
    }

    if (existing) {
      await db
        .update(dataEntries)
        .set({
          value_boolean: p.valueBoolean,
          value: null,
          status_id: DataEntryStatusId.Entered,
          no_data_reason: null,
          updatedAt: new Date(),
        })
        .where(eq(dataEntries.id, existing.id));
      updated += 1;
    } else {
      await db.insert(dataEntries).values({
        report_period_id: p.reportPeriodId,
        measure_def_id: p.measureDefId,
        utility_id: p.utilityId,
        service_area_id: null,
        unit_id: null,
        ...DIMS,
        value_boolean: p.valueBoolean,
        status_id: DataEntryStatusId.Entered,
        is_relevant: true,
        is_deleted: false,
        updatedAt: new Date(),
      });
      inserted += 1;
    }
    } catch (e: unknown) {
      failures.push({ address, error: describeError(e) });
    }
  }

  for (const f of failures.slice(0, 20)) {
    console.error(`FAILED ${f.address}: ${f.error}`);
  }
  if (failures.length > 20) {
    console.error(`... and ${failures.length - 20} more failures`);
  }

  console.log(
    DRY_RUN
      ? `(dry run) would update ${updated}, insert ${inserted}`
      : `done: updated ${updated}, inserted ${inserted}, failed ${failures.length}`,
  );

  // Post-state check.
  const after = await db
    .select({
      measure: dataEntries.measure_def_id,
      trues: dataEntries.value_boolean,
    })
    .from(dataEntries)
    .where(inArray(dataEntries.measure_def_id, measureIds));
  const dist = new Map<number, { t: number; f: number }>();
  for (const r of after) {
    const d = dist.get(r.measure) ?? { t: 0, f: 0 };
    if (r.trues === true) d.t += 1;
    else if (r.trues === false) d.f += 1;
    dist.set(r.measure, d);
  }
  console.log("\npost-state (measure: true/false):");
  for (const [m, d] of [...dist.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${m}: true=${d.t} false=${d.f}`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("FAILED:", (e as Error).message);
    process.exit(1);
  },
);
