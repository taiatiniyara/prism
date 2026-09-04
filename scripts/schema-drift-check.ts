/**
 * Schema drift check — does the Drizzle model (db/schema/) still match the live database?
 *
 * WHY: p2 schema changes have been made on two hand-synced tracks (Drizzle model + raw
 * scripts/sql), which drift over time. A `drizzle-kit push --force` that later reconciles
 * that drift can RECREATE tables and wipe data (this is how data_entries went to 0 on
 * 2026-09-04). This check surfaces drift EARLY so it never accumulates into a data-loss
 * reconciliation. Run it in CI on every PR and on a schedule against live p2.
 *
 * SAFETY: strictly READ-ONLY. It only SELECTs from information_schema — it can never
 * ALTER, DROP, or write anything. It is NOT drizzle-kit push and never applies a plan.
 *
 * SCOPE (v1): tables present, columns present, column data-type, and nullability. It does
 * NOT yet diff FKs, indexes, constraint names, defaults, or enums — those are follow-ups;
 * this covers the structural drift class that caused the incident. Extra columns in the DB
 * that the model doesn't declare are reported as warnings (they don't break `push`, but they
 * signal a hand-SQL change that never made it into the model).
 *
 * EXIT CODES: 0 = in sync · 1 = drift detected · 2 = check error (e.g. no DATABASE_URL).
 * FLAGS: --github emits ::error:: / ::warning:: annotation lines for inline PR display.
 * Run: npx tsx scripts/schema-drift-check.ts [--github]   (needs DATABASE_URL in env)
 */
import { Pool } from "pg";
import { is, getTableColumns } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

// Drizzle columnType -> the information_schema.data_type(s) it should map to.
// A value may map to several DB types (e.g. timestamp with/without tz); any match passes.
const TYPE_MAP: Record<string, string[]> = {
  PgInteger: ["integer"],
  PgSerial: ["integer"],
  PgSmallInt: ["smallint"],
  PgSmallSerial: ["smallint"],
  PgBigInt53: ["bigint"],
  PgBigSerial53: ["bigint"],
  PgVarchar: ["character varying"],
  PgText: ["text"],
  PgChar: ["character"],
  PgBoolean: ["boolean"],
  PgNumeric: ["numeric"],
  PgReal: ["real"],
  PgDoublePrecision: ["double precision"],
  PgUUID: ["uuid"],
  PgDate: ["date"],
  PgJson: ["json"],
  PgJsonb: ["jsonb"],
  PgTimestamp: ["timestamp without time zone", "timestamp with time zone"],
  PgTime: ["time without time zone", "time with time zone"],
};

type LiveCol = {
  column_name: string;
  data_type: string;
  is_nullable: string;
};

async function main() {
  // --github emits GitHub Actions annotation lines (::error:: / ::warning::) so drift
  // shows inline on the PR diff. Backward-compatible: default output is unchanged.
  const github = process.argv.includes("--github");
  const annotate = (level: "error" | "warning", msg: string) => {
    if (github) console.log(`::${level}::${msg.replace(/\n/g, " ")}`);
  };

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // exit 2 = check couldn't run (no creds / DB unreachable) → CI should WARN, not block.
    annotate("warning", "schema drift-check skipped: DATABASE_URL not set (check could not run)");
    console.error("drift-check: DATABASE_URL not set.");
    process.exit(2);
  }

  const errors: string[] = []; // hard drift → exit 1
  const warnings: string[] = []; // extra DB columns not in model → report, don't fail

  const pool = new Pool({ connectionString });
  const c = await pool.connect();
  try {
    const tables = Object.values(schema).filter((v): v is PgTable =>
      is(v, PgTable),
    );

    for (const table of tables) {
      const cfg = getTableConfig(table);
      const schemaName = cfg.schema ?? "public";
      const tableName = cfg.name;

      const { rows: live } = await c.query<LiveCol>(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2`,
        [schemaName, tableName],
      );

      if (live.length === 0) {
        errors.push(
          `MISSING TABLE: ${schemaName}.${tableName} is in the model but not in the DB`,
        );
        continue;
      }

      const liveByName = new Map(live.map((r) => [r.column_name, r]));
      const cols = getTableColumns(table);
      const modelColNames = new Set<string>();

      for (const key of Object.keys(cols)) {
        const col = cols[key];
        modelColNames.add(col.name);
        const lc = liveByName.get(col.name);
        if (!lc) {
          errors.push(
            `${tableName}.${col.name}: declared in model, MISSING in DB`,
          );
          continue;
        }
        // nullability
        const modelNullable = !col.notNull;
        const dbNullable = lc.is_nullable === "YES";
        if (modelNullable !== dbNullable) {
          errors.push(
            `${tableName}.${col.name}: nullability model=${
              modelNullable ? "NULL" : "NOT NULL"
            } db=${dbNullable ? "NULL" : "NOT NULL"}`,
          );
        }
        // data type (only when we have a mapping — unknown/custom types are skipped, not flagged)
        const expected = TYPE_MAP[col.columnType];
        if (expected && !expected.includes(lc.data_type)) {
          errors.push(
            `${tableName}.${col.name}: type model=${col.columnType} (expected ${expected.join(
              " | ",
            )}) db=${lc.data_type}`,
          );
        }
      }

      for (const r of live) {
        if (!modelColNames.has(r.column_name)) {
          warnings.push(
            `${tableName}.${r.column_name}: present in DB but NOT in the model (hand-SQL not reflected in Drizzle?)`,
          );
        }
      }
    }
  } finally {
    c.release();
    await pool.end();
  }

  if (warnings.length > 0) {
    console.warn(`\n⚠ ${warnings.length} DB-only column(s) not in the model:`);
    for (const w of warnings) {
      console.warn("  - " + w);
      annotate("warning", w);
    }
  }

  if (errors.length === 0) {
    console.log(
      "\n✅ No schema drift: the Drizzle model matches the live DB (tables / columns / types / nullability).",
    );
    process.exit(0);
  }

  console.error(`\n❌ Schema drift detected — ${errors.length} issue(s):`);
  for (const e of errors) {
    console.error("  - " + e);
    annotate("error", e);
  }
  console.error(
    "\nReconcile with a REVIEWED migration (drizzle-kit generate), never `db-push --force` without a backup.",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error("drift-check error:", e);
  process.exit(2);
});
