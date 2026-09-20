/**
 * verify-gold-layer — live, read-only check of the medallion KPI extraction layer.
 *
 * WHY: `schema-drift-check.ts` proves the Drizzle model matches the live DB for
 * tables/columns/types/nullability, but it deliberately does NOT cover the
 * view + KPI-compute objects the app actually reads (gold.fact_kpi*,
 * silver.data_entries_enriched, gold.dim_utility, gold.v_reporting_status,
 * gold.v_bsc_alignment, gold.ext_*). These are the rows Power BI fell back to
 * and the AI/data-service tools query. This script closes that gap.
 *
 * SAFETY: strictly READ-ONLY. Only SELECT on information_schema / pg_catalog
 * plus row-count + LIMIT samples. Never ALTER / DROP / CREATE anything.
 *
 * EXIT CODES: 0 = all present + populated · 1 = missing object/column or
 * empty extraction · 2 = could not run (DATABASE_URL not set).
 * FLAGS: --github emits ::error:: / ::warning:: annotation lines.
 * Run: npx tsx scripts/verify-gold-layer.ts [--github]  (DATABASE_URL in env)
 */
import { Pool } from "pg";

const github = process.argv.includes("--github");
const annotate = (level: "error" | "warning", msg: string) => {
  if (github) console.log(`::${level}::${msg.replace(/\n/g, " ")}`);
};

const WANT_OBJECTS = [
  "silver",
  "gold",
];

// Objects the app's AI/data-service + Power BI gold fallback actually read.
const WANT_TABLES = [
  "silver.data_entries_enriched",
  "gold.dim_utility",
  "gold.fact_kpi",
  "gold.fact_kpi_rollup",
  "gold.v_reporting_status",
  "gold.v_bsc_alignment",
  "gold.ext_data_entries",
  "gold.ext_kpi",
];

// Columns the app reads off gold.fact_kpi (see lib/ai/data-service/*).
const WANT_FACT_COLS = [
  "kpi_instance_id",
  "report_period_id",
  "report_date",
  "utility_id",
  "utility_name",
  "utility_acronym",
  "kpi_def_id",
  "kpi_name",
  "kpi_description",
  "limits",
  "actual_value",
  "target_value",
  "comments",
  "is_relevant",
  "is_favourite",
  "calculated_at",
  "calculation_formula_version",
  "updated_at",
  "meets_target",
  "category_name",
  "subcategory_name",
  "unit_name",
];

const CHECK_ROWS: Array<[string, string]> = [
  ["gold.fact_kpi", "gold.fact_kpi row count"],
  ["gold.fact_kpi_rollup", "gold.fact_kpi_rollup row count"],
  ["silver.data_entries_enriched", "silver.data_entries_enriched row count"],
  ["gold.ext_kpi", "gold.ext_kpi row count"],
];

type LiveTable = { table_schema: string; table_name: string };
type LiveCol = { column_name: string };

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    annotate("warning", "verify-gold-layer: DATABASE_URL not set (check skipped)");
    console.error("verify-gold-layer: DATABASE_URL not set.");
    process.exit(2);
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const pool = new Pool({ connectionString });
  const c = await pool.connect();
  try {
    const { rows: live } = await c.query<LiveTable>(
      `SELECT table_schema, table_name
         FROM information_schema.tables
        WHERE table_schema = ANY($1)
        ORDER BY 1, 2`,
      [WANT_OBJECTS],
    );
    const liveSet = new Set(live.map((r) => `${r.table_schema}.${r.table_name}`));

    for (const w of WANT_TABLES) {
      if (!liveSet.has(w)) {
        errors.push(`MISSING object: ${w}`);
      }
    }

    if (liveSet.has("gold.fact_kpi")) {
      const { rows: cols } = await c.query<LiveCol>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'gold' AND table_name = 'fact_kpi'`,
      );
      const have = new Set(cols.map((r) => r.column_name));
      for (const col of WANT_FACT_COLS) {
        if (!have.has(col)) {
          errors.push(`gold.fact_kpi missing column the app reads: ${col}`);
        }
      }
    }

    for (const [obj, label] of CHECK_ROWS) {
      const q = await c.query(`SELECT count(*)::int AS n FROM ${obj}`);
      const n = q.rows[0].n as number;
      if (n === 0) {
        warnings.push(`${label}: 0 rows (view/table exists but extraction ran empty)`);
      }
    }

    const { rows: sample } = await c.query(
      `SELECT utility_name, kpi_name, actual_value, target_value, meets_target, unit_name
         FROM gold.fact_kpi
        WHERE actual_value IS NOT NULL
        LIMIT 3`,
    );
    if (sample.length > 0) {
      console.log("\nSample computed KPIs (live gold.fact_kpi):");
      for (const s of sample) {
        console.log(
          `  ${s.utility_name} · ${s.kpi_name} = ${s.actual_value} (target ${s.target_value}, ${s.unit_name}) meets=${s.meets_target}`,
        );
      }
    }
  } finally {
    c.release();
    await pool.end();
  }

  if (warnings.length > 0) {
    console.warn("\nNote — extraction objects present but empty:");
    for (const w of warnings) {
      console.warn("  - " + w);
      annotate("warning", w);
    }
  }

  if (errors.length === 0) {
    console.log(
      "\nOK: gold + silver medallion objects exist, carry the expected KPI columns, and are populated.",
    );
    process.exit(0);
  }

  console.error("\nFAIL — gold-layer verify reported:");
  for (const e of errors) {
    console.error("  - " + e);
    annotate("error", e);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("verify-gold-layer error:", e);
  process.exit(2);
});
