/**
 * db-push-safe — take a FRESH backup of the entered-data tables, THEN push.
 *
 * Enforces the rule: never `drizzle-kit push --force` against p2 without a fresh
 * backup. On 2026-09-04 a `--force` push recreated a drifted table and wiped
 * data_entries; this makes any destructive push recoverable.
 *
 * Steps: snapshot data_entries + data_entry_logs -> backup.<table>_prepush_<ts>,
 * then run `drizzle-kit push --force`. Reference/config tables are intentionally
 * NOT backed up here — they are reseedable via `npm run db-seed`.
 *
 * EXIT: 2 = no DATABASE_URL · 1 = backup or push failed.
 */
import { Client } from "pg";
import { execSync } from "node:child_process";

// Irreplaceable entered data (cannot be trivially regenerated). Reference data is reseedable.
const TABLES = ["data_entries", "data_entry_logs"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("db-push-safe: DATABASE_URL not set — refusing to push.");
    process.exit(2);
  }

  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHMMSS
  const c = new Client({ connectionString: url, ssl: false });
  await c.connect();
  await c.query("CREATE SCHEMA IF NOT EXISTS backup");

  for (const t of TABLES) {
    const exists = (await c.query("SELECT to_regclass($1) AS r", [`public.${t}`])).rows[0].r;
    if (!exists) {
      console.warn(`db-push-safe: table public.${t} not found — skipping.`);
      continue;
    }
    const n = (await c.query(`SELECT count(*)::int AS n FROM public."${t}"`)).rows[0].n;
    const target = `backup."${t}_prepush_${ts}"`;
    await c.query(`CREATE TABLE ${target} AS SELECT * FROM public."${t}"`);
    console.log(`db-push-safe: backed up ${t} (${n} rows) -> ${target}`);
    if (n === 0) console.warn(`  note: ${t} was EMPTY — backup created but holds no rows.`);
  }
  await c.end();

  console.log("db-push-safe: backups done. Running `drizzle-kit push --force` ...");
  execSync("npx drizzle-kit push --config ./db/config.ts --force", { stdio: "inherit" });
  console.log(`db-push-safe: push complete. Restore point if needed: backup.*_prepush_${ts}`);
}

main().catch((e) => {
  console.error("db-push-safe FATAL:", e.message);
  process.exit(1);
});
