import "dotenv/config";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Applies scripts/sql/2026-09-03-drop-kpi-attempt-deferred-follow-up.sql —
 * drops the write-only kpi_calculation_attempts.deferred_follow_up column
 * (#237; the writer was removed by PR #335, live). Idempotent (DROP ... IF EXISTS).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "scripts/sql/2026-09-03-drop-kpi-attempt-deferred-follow-up.sql",
    ),
    "utf8",
  );
  const pool = new Pool({ connectionString: url });
  try {
    const before = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'kpi_calculation_attempts'
         AND column_name = 'deferred_follow_up'`,
    );
    await pool.query(sql);
    const after = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'kpi_calculation_attempts'
         AND column_name = 'deferred_follow_up'`,
    );
    console.log("deferred_follow_up present before:", before.rowCount === 1);
    console.log("deferred_follow_up present after:", after.rowCount === 1);
    if (after.rowCount !== 0) throw new Error("column still present after drop");
    console.log("Applied.");
  } finally {
    await pool.end();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
  },
);
