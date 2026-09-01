/**
 * Rebuild country_context from the p1 (prism-training) platform (2026-09-01).
 *
 * The p2 country_context table was truncated when period_year was removed and the
 * key moved to source_date. This script repopulates it from p1's /dataEntryMain,
 * filtering to the subgroup-221 country-context dl defs (input_dl_def_mappings).
 *
 * p1 stores the country-context figures per (utility report period, country, measure);
 * the value is the SAME national figure across every period of a country (a constant
 * per country × measure). So we collapse to ONE row per (country_id, measure_def_id):
 *   - value      = the figure (option-typed measures resolved to their option_id)
 *   - source_date = the EARLIEST report_date the figure was reported in — the as-of
 *                   "known since" date. Under getResolvedContextRows' carry-forward
 *                   (latest source_date strictly before a period's report_date), the
 *                   figure then applies to every later report period.
 *
 * Country resolution: p1 rows carry country_id + utility_report_period_id; we map to
 * p2 M49 via report_periods.utility_id -> organisations.country_id (1:1 per p1 country).
 *
 *   node --env-file=.env --import tsx scripts/rebuild-country-context-from-p1.ts [--dry-run]
 *
 * --dry-run prints the planned rows WITHOUT writing.
 */
import "dotenv/config";
import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const BASE = process.env.PRISM_TRAINING_API_BASE_URL;
const KEY = process.env.PRISM_TRAINING_API_KEY;

if (!BASE || !KEY) {
  throw new Error("PRISM_TRAINING_API_BASE_URL / PRISM_TRAINING_API_KEY not configured");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type P1Row = {
  country_id: number;
  utility_report_period_id: number;
  dl_def_id: number;
  dl_value: string | null;
  data_not_available: boolean;
  is_deleted: boolean;
  updated_date: string | null;
};

async function main() {
  // subgroup-221 measures -> p1 dl ids
  const mapRows = (
    await pool.query(
      `SELECT md.id AS mid, md.name AS mname, md.data_type_id AS dt, iddm.training_dl_def_id AS dl
       FROM measure_definitions md
       LEFT JOIN input_dl_def_mappings iddm ON iddm.measure_def_id = md.id
       WHERE md.measures_subgroup_id = 221`,
    )
  ).rows;
  const dlToMid = new Map<number, number>(
    mapRows.filter((r) => r.dl != null).map((r) => [Number(r.dl), Number(r.mid)]),
  );
  const measureName = new Map<number, string>(mapRows.map((r) => [Number(r.mid), r.mname]));
  const optionMeasureIds = new Set<number>(mapRows.filter((r) => r.dt != null).map((r) => Number(r.mid)));

  const rps = (
    await pool.query(`SELECT id, utility_id, report_date FROM report_periods`)
  ).rows;
  const rpById = new Map<number, { utility_id: number; report_date: Date }>(
    rps.map((r) => [r.id, { utility_id: r.utility_id, report_date: r.report_date }]),
  );
  const orgs = (await pool.query(`SELECT id, country_id FROM organisations`)).rows;
  const countryByUtil = new Map<number, number>(orgs.map((o) => [o.id, o.country_id]));

  // option measures: resolve the p1 label ("Price Regulation") -> managed_list_items id,
  // the form country_context.value stores (read back to the label by the bridge).
  const optLabels = (
    await pool.query(
      `SELECT ml.name AS list, mli.name AS item, mli.id AS id
       FROM managed_lists ml
       JOIN managed_list_items mli ON mli.list_id = ml.id
       WHERE ml.name IN (${
         [...optionMeasureIds].map((m) => `'${measureName.get(m)}'`).join(",") || "''"
       })`,
    )
  ).rows;
  const labelToId = new Map<string, number>(
    optLabels.map((r) => [r.item, r.id]),
  );

  // fetch p1
  console.log(`fetching ${BASE}/dataEntryMain ...`);
  const res = await fetch(`${BASE}/dataEntryMain`, {
    headers: { Authorization: KEY },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`dataEntryMain HTTP ${res.status}`);
  const raw = (await res.json()) as P1Row[];

  const cc = raw.filter(
    (r) => dlToMid.has(r.dl_def_id) && rpById.has(r.utility_report_period_id) && !r.is_deleted,
  );
  console.log(`p1 rows: ${raw.length}  country-context rows: ${cc.length}`);

  // group by (m49, measure): collect report dates + latest value
  const groups = new Map<string, { m49: number; mid: number; dates: number[]; latest: { v: string | null; upd: number; na: boolean } }>();
  for (const r of cc) {
    const rp = rpById.get(r.utility_report_period_id)!;
    const m49 = countryByUtil.get(rp.utility_id);
    if (m49 == null) continue;
    const mid = dlToMid.get(r.dl_def_id)!;
    const k = `${m49}|${mid}`;
    const g = groups.get(k) ?? { m49, mid, dates: [], latest: { v: null, upd: 0, na: false } };
    g.dates.push(rp.report_date.getTime());
    const upd = r.updated_date ? new Date(r.updated_date).getTime() : 0;
    if (upd >= g.latest.upd) g.latest = { v: r.dl_value, upd, na: r.data_not_available };
    groups.set(k, g);
  }

  const rows: { country_id: number; measure_def_id: number; source_date: Date; value: string | null; no_data_reason: "not_available" | null; updated_by: string }[] = [];
  const varied: { k: string; count: number }[] = [];
  for (const g of groups.values()) {
    const sourceDate = new Date(Math.min(...g.dates));
    let value: string | null = g.latest.v;
    const reason: "not_available" | null = g.latest.na ? "not_available" : null;
    if (value != null && optionMeasureIds.has(g.mid)) {
      value = labelToId.get(value) != null ? String(labelToId.get(value)) : value;
    }
    rows.push({
      country_id: g.m49,
      measure_def_id: g.mid,
      source_date: sourceDate,
      value,
      no_data_reason: reason,
      updated_by: "p1 import",
    });
    varied.push({ k: `${g.m49}|${g.mid}`, count: g.dates.length });
  }

  console.log(`planned rows: ${rows.length}  (countries: ${new Set(rows.map((r) => r.country_id)).size}, measures: ${new Set(rows.map((r) => r.measure_def_id)).size})`);
  console.log(`rows per country:`);
  const perCountry = new Map<number, number>();
  for (const r of rows) perCountry.set(r.country_id, (perCountry.get(r.country_id) ?? 0) + 1);
  for (const [c, n] of [...perCountry.entries()].sort((a, b) => a[0] - b[0])) console.log(`  m49 ${c}: ${n} rows`);

  const sourceDates = [...new Set(rows.map((r) => r.source_date.toISOString().slice(0, 10)))].sort();
  console.log(`distinct source_dates: ${sourceDates.length} -> ${sourceDates.slice(0, 12).join(", ")}${sourceDates.length > 12 ? "…" : ""}`);

  if (DRY_RUN) {
    console.log(`\n--dry-run: ${rows.length} rows would insert (none written).`);
    process.exit(0);
  }

  await pool.query(`INSERT INTO country_context (country_id, measure_def_id, source_date, value, no_data_reason, updated_by, updated_date)
    SELECT * FROM unnest(
      $1::int[], $2::int[], $3::date[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
    )`,
    [
      rows.map((r) => r.country_id),
      rows.map((r) => r.measure_def_id),
      rows.map((r) => r.source_date),
      rows.map((r) => r.value),
      rows.map((r) => r.no_data_reason),
      rows.map((r) => r.updated_by),
      rows.map(() => new Date()),
    ],
  );
  console.log(`\nINSERTED ${rows.length} rows into country_context.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});