import "dotenv/config";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = readFileSync(
    path.join(process.cwd(), "scripts/sql/2026-07-26-admin-mfa.sql"),
    "utf8",
  );
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(sql);
    // Verify
    const cols = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name='user' AND column_name='two_factor_enabled')
          OR (table_name='session' AND column_name='two_factor_verified_at')
       ORDER BY table_name`,
    );
    const tbl = await pool.query(
      `SELECT to_regclass('public.two_factor') AS two_factor_table`,
    );
    console.log("Applied. Verified columns:", cols.rows);
    console.log("two_factor table:", tbl.rows[0]);
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
