/**
 * Backfill data_entries.multiplier from prism-training's data_entry_main
 * (2026-08-25). The p1 extract migration dropped the multiplier field, so every
 * row defaulted to 'Ones' even where the utility reported in Thousands — which
 * understates converted figures 1000x for those rows.
 *
 * Scope: currency measures only (is_currency = true) — the set whose USD
 * conversion depends on the unit scale.
 *
 * Matching: source rows are joined to PRISM 2 entries by (report_period_id,
 * measure_def_id) at matching grain — utility-level (service_area/unit NULL)
 * first, then by the source's own service_area when present.
 *
 *   npx tsx scripts/backfill-multipliers-from-training.ts --dry-run
 *   npx tsx scripts/backfill-multipliers-from-training.ts
 */
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/connection";
import {
  dataEntries,
  measureDefinitions,
  inputDlDefMappings,
} from "@/db/schema/dataEntry";
import { sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");

const RAW_URL = process.env.PRISM_TRAINING_API_BASE_URL;
const RAW_KEY = process.env.PRISM_TRAINING_API_KEY;

type RawRow = {
  dl_def_id: number;
  dl_value: string | null;
  utility_report_period_id: number;
  service_area_id: number | null;
  energy_resource_id: number | null;
  multiplier: string | null;
  is_deleted: boolean;
};

function normalizeMultiplier(raw: string | null): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

// Currency measures that have NO input_dl_def_mappings row (their data arrived
// via the extract workbook by direct p2 id). Training dl ids were resolved by
// name from /migration/dlDef against the catalogue gaps in the 421304xxxx block.
// Cost measures are function-sliced in PRISM 2 via separate per-function dls.
const PINNED_PAIRS: Array<{ dl: number; mid: number; fn?: number }> = [
  { dl: 4213040106, mid: 214 }, // Amortization Expense
  { dl: 4213040112, mid: 220 }, // Income Taxes
  { dl: 4213040061, mid: 145 }, // Fuel Expenditure -> Fuel & Oil Expenditure
  { dl: 4213040066, mid: 146 }, // Other Labor Expenditure -> Other Staff
  { dl: 4213040067, mid: 147 }, // Other Expenditure -> Other O&M
  { dl: 4213040068, mid: 148 }, // Duty on Fuel and Lube Oil
  { dl: 4213040072, mid: 149 }, // Other Duty and Taxes
  // Electricity Staff (141) / Electricity O&M (142) sliced by utility function
  { dl: 4213040069, mid: 141, fn: 1024 }, // Generation Labor Costs
  { dl: 4213040070, mid: 141, fn: 1026 }, // Transmission Labor Costs
  { dl: 4213040071, mid: 141, fn: 1025 }, // Distribution Labor Costs
  { dl: 4213040062, mid: 142, fn: 1024 }, // Generation OM Costs
  { dl: 4213040064, mid: 142, fn: 1026 }, // Transmission OM Costs
  { dl: 4213040065, mid: 142, fn: 1025 }, // Distribution OM Costs
  // NB: 143 Electricity Purchases has no utility-level training dl (only
  // IPP/customer variants) — left at default. 230 Total Costs is calculated
  // (RAW-ONLY) so has nothing to update.
];

async function main() {
  if (!RAW_URL || !RAW_KEY) {
    throw new Error("PRISM_TRAINING_API_BASE_URL / PRISM_TRAINING_API_KEY are not configured.");
  }

  // Currency measures + their training dl ids.
  const mapRows = await db
    .select({
      measureId: measureDefinitions.id,
      name: measureDefinitions.name,
      trainingDl: inputDlDefMappings.training_dl_def_id,
    })
    .from(measureDefinitions)
    .innerJoin(
      inputDlDefMappings,
      eq(inputDlDefMappings.measure_def_id, measureDefinitions.id),
    )
    .where(eq(measureDefinitions.is_currency, true));

  const dlToMeasure = new Map<number, number>();
  const fnByPair = new Map<string, number>();
  for (const r of mapRows) {
    const mid = Number(r.measureId);
    dlToMeasure.set(Number(r.trainingDl), mid);
  }
  for (const p of PINNED_PAIRS) {
    dlToMeasure.set(p.dl, p.mid);
    if (p.fn != null) fnByPair.set(`${p.dl}`, p.fn);
  }
  console.log(
    `currency measures mapped: ${dlToMeasure.size} (measures ${[...new Set(dlToMeasure.values())].sort((a, b) => a - b).join(", ")})`,
  );

  process.stdout.write("fetching training dataEntryMain ... ");
  const res = await fetch(`${RAW_URL}/dataEntryMain`, {
    headers: { Authorization: RAW_KEY },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`dataEntryMain HTTP ${res.status}`);
  const raw = (await res.json()) as RawRow[];
  console.log(`${raw.length} rows`);

  // Collapse to distinct (rp, measure) -> {multiplier, serviceArea} — last wins,
  // mirroring the governance fix. Skip deleted/empty/unmapped/Ones rows early.
  const byAddress = new Map<
    string,
    { rp: number; mid: number; mult: string; sa: number | null; fn: number | null }
  >();
  let skippedDeleted = 0;
  let skippedEmpty = 0;
  let skippedUnmapped = 0;
  let alreadyOnes = 0;

  for (const r of raw) {
    if (r.is_deleted) {
      skippedDeleted += 1;
      continue;
    }
    const mid = dlToMeasure.get(r.dl_def_id);
    if (mid == null) {
      skippedUnmapped += 1;
      continue;
    }
    const value = r.dl_value == null ? "" : String(r.dl_value).trim();
    if (value === "") {
      skippedEmpty += 1;
      continue;
    }
    const mult = normalizeMultiplier(r.multiplier);
    if (mult == null || mult === "Ones") {
      alreadyOnes += 1;
      continue; // default already correct
    }
    byAddress.set(`${r.utility_report_period_id}:${mid}:${r.dl_def_id}`, {
      rp: r.utility_report_period_id,
      mid,
      mult,
      sa: r.service_area_id ?? null,
      fn: fnByPair.get(String(r.dl_def_id)) ?? null,
    });
  }
  console.log(
    `non-Ones addresses to apply: ${byAddress.size} (skipped: deleted=${skippedDeleted}, empty=${skippedEmpty}, unmapped=${skippedUnmapped}, ones=${alreadyOnes})`,
  );

  if (!DRY_RUN && byAddress.size > 0) {
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS backup.mult_pre_backfill_20260825 AS
        SELECT id, report_period_id, measure_def_id, multiplier FROM data_entries
        WHERE measure_def_id IN (SELECT DISTINCT measure_def_id FROM input_dl_def_mappings WHERE measure_def_id IN (SELECT id FROM measure_definitions WHERE is_currency))`,
    );
    console.log("snapshot written: backup.mult_pre_backfill_20260825");
  }

  let updatedUtility = 0;
  let updatedSa = 0;
  let notFound = 0;
  let alreadySet = 0;
  const failures: string[] = [];

  for (const { rp, mid, mult, sa, fn } of byAddress.values()) {
    try {
      const base = [
        eq(dataEntries.report_period_id, rp),
        eq(dataEntries.measure_def_id, mid),
      ];

      // utility-level grain first (function slice when the pair is fn-scoped)
      let rows = await db
        .select({ id: dataEntries.id, current: dataEntries.multiplier })
        .from(dataEntries)
        .where(
          and(
            ...base,
            isNull(dataEntries.service_area_id),
            isNull(dataEntries.unit_id),
            ...(fn != null ? [eq(dataEntries.utility_function_id, fn)] : []),
          ),
        );

      // fall back: same measure/period at utility grain without the fn filter
      if (rows.length === 0 && fn != null) {
        rows = await db
          .select({ id: dataEntries.id, current: dataEntries.multiplier })
          .from(dataEntries)
          .where(and(...base, isNull(dataEntries.service_area_id), isNull(dataEntries.unit_id)));
      }

      // fall back to the source's own service area
      if (rows.length === 0 && sa != null) {
        rows = await db
          .select({ id: dataEntries.id, current: dataEntries.multiplier })
          .from(dataEntries)
          .where(and(...base, eq(dataEntries.service_area_id, sa)));
      }

      if (rows.length === 0) {
        notFound += 1;
        continue;
      }

      for (const row of rows) {
        if (row.current === mult) {
          alreadySet += 1;
          continue;
        }
        if (!DRY_RUN) {
          await db
            .update(dataEntries)
            .set({ multiplier: mult })
            .where(eq(dataEntries.id, row.id));
        }
        updatedUtility += sa == null ? 1 : 0;
        updatedSa += sa != null ? 1 : 0;
      }
    } catch (e) {
      failures.push(`rp=${rp} m=${mid}: ${(e as Error).message?.split("\n")[0]}`);
    }
  }

  for (const f of failures.slice(0, 10)) console.error("FAILED", f);
  console.log(
    DRY_RUN
      ? `(dry run) would update ${updatedUtility + updatedSa} rows (utility-grain=${updatedUtility}, sa-grain=${updatedSa}); unmatched=${notFound}; already-correct=${alreadySet}`
      : `done: updated ${updatedUtility + updatedSa} rows (utility-grain=${updatedUtility}, sa-grain=${updatedSa}); unmatched=${notFound}; already-correct=${alreadySet}; failures=${failures.length}`,
  );

  // Post-state distribution across currency measures.
  const after = await db.execute(
    sql`select multiplier, count(*)::int n from data_entries d
        join measure_definitions m on m.id = d.measure_def_id
        where m.is_currency and not d.is_deleted group by 1 order by 2 desc`,
  );
  console.log(
    "post-state currency-row multipliers:",
    (after.rows as Array<{ multiplier: string; n: number }>)
      .map((r) => `${r.multiplier}:${r.n}`)
      .join("  "),
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("FAILED:", (e as Error).message);
    process.exit(1);
  },
);
