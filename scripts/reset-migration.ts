/**
 * Reset the migration target + ledgers to a clean slate for a fresh iteration.
 *
 * Empties, in FK-safe order:
 *   - data_entries          (CASCADE → data_entry_logs)   the loaded rows
 *   - migration_rejections   the per-run rejection ledger
 *   - migration_scorecard    the per-run reconciliation scorecard
 *   - migration_loads        the load history            (skip with --keep-loads)
 *
 * migrate.ts already flush-and-reloads data_entries on every run, so you don't NEED this before a
 * normal re-run — use it when you want a full clean slate (also clearing the ledgers + load history)
 * between migration attempts.
 *
 *   node --env-file=.env --import tsx scripts/reset-migration.ts [--keep-loads]
 */
import { db } from "../db/connection";
import { sql } from "drizzle-orm";

async function count(t: string): Promise<number> {
  try {
    const r = (await db.execute(sql`SELECT count(*)::int AS c FROM ${sql.raw(t)}`)).rows ?? [];
    return Number((r[0] as { c: number } | undefined)?.c ?? 0);
  } catch {
    return -1; // table absent
  }
}

async function main() {
  const keepLoads = process.argv.includes("--keep-loads");
  const targets = ["data_entries", "migration_rejections", "migration_scorecard", "migration_loads"];
  console.log("BEFORE:");
  for (const t of targets) console.log(`  ${t}: ${await count(t)}`);

  console.log("\nTruncating…");
  await db.execute(sql`TRUNCATE data_entries CASCADE`); // clears data_entry_logs too
  await db.execute(sql`TRUNCATE migration_rejections RESTART IDENTITY`);
  await db.execute(sql`TRUNCATE migration_scorecard RESTART IDENTITY`);
  if (!keepLoads) await db.execute(sql`TRUNCATE migration_loads RESTART IDENTITY`);
  else console.log("  (--keep-loads: migration_loads history retained)");

  console.log("\nAFTER:");
  for (const t of targets) console.log(`  ${t}: ${await count(t)}`);
  console.log("\n✓ Clean slate — ready to re-run scripts/migrate.ts.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
