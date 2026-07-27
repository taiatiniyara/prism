/**
 * Rename the energy-dimension keys inside kpi_definitions.formula_inputs JSON to
 * match the physicalised column names (companion to
 * scripts/sql/2026-07-27-physicalise-energy-dimension-names.sql).
 *
 * A column rename does NOT touch JSON keys, so the FormulaInput blobs must be
 * rewritten separately:
 *   energy_provider_id      -> provider_id
 *   energy_type_id          -> category_id
 *   energy_source_id        -> technology_id
 *   energy_resource_type_id -> asset_id
 * (energy_resource_id is a grain anchor, not a formula_input dim key — not renamed.)
 *
 * Read-only by default; --apply writes (in a txn, after backing up). Idempotent:
 * a row already migrated has no old keys, so re-runs are no-ops. Mirrors the
 * existing scripts/fix-kpi-formula-input-key.ts precedent.
 *
 *   Dry-run: node --env-file=.env --import tsx scripts/rename-formula-input-energy-keys.ts
 *   Apply:   node --env-file=.env --import tsx scripts/rename-formula-input-energy-keys.ts --apply
 */
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const APPLY = process.argv.includes("--apply");

const KEY_MAP: Record<string, string> = {
  energy_provider_id: "provider_id",
  energy_type_id: "category_id",
  energy_source_id: "technology_id",
  energy_resource_type_id: "asset_id",
};

async function main() {
  const rows = (
    await pool.query<{ id: number; name: string; formula_inputs: unknown }>(
      `select id, name, formula_inputs from kpi_definitions where formula_inputs is not null`,
    )
  ).rows;

  const updates: { id: number; name: string; next: unknown[] }[] = [];
  for (const r of rows) {
    const fis = r.formula_inputs;
    if (!Array.isArray(fis)) continue;
    let touched = false;
    const next = fis.map((fi) => {
      const o: Record<string, unknown> = { ...(fi as Record<string, unknown>) };
      for (const [oldK, newK] of Object.entries(KEY_MAP)) {
        if (Object.prototype.hasOwnProperty.call(o, oldK)) {
          if (!Object.prototype.hasOwnProperty.call(o, newK)) o[newK] = o[oldK];
          delete o[oldK];
          touched = true;
        }
      }
      return o;
    });
    if (touched) updates.push({ id: r.id, name: r.name, next });
  }

  console.log(
    `${APPLY ? "APPLYING" : "DRY-RUN"}: ${updates.length} kpi_definitions row(s) carry energy_* formula_input keys to rename (of ${rows.length} with formula_inputs).`,
  );
  for (const u of updates.slice(0, 20)) console.log(`    #${u.id} ${u.name}`);
  if (updates.length > 20) console.log(`    … and ${updates.length - 20} more`);

  if (!APPLY) {
    console.log("\nRe-run with --apply to write (backs up to backup.* first).");
    return;
  }
  if (updates.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `create table if not exists backup.kpi_formula_inputs_energyrename_20260727 as
         select id, formula_inputs from kpi_definitions where formula_inputs is not null`,
    );
    for (const u of updates) {
      await client.query(`update kpi_definitions set formula_inputs = $1 where id = $2`, [
        JSON.stringify(u.next),
        u.id,
      ]);
    }
    await client.query("commit");
    console.log(`\nApplied ${updates.length} updates (backup: backup.kpi_formula_inputs_energyrename_20260727).`);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
