// One-time migration: rewrite the legacy `input_def_id` key to the canonical
// `measure_def_id` in every kpi_definitions.formula_inputs element.
//
// Context: the medallion `input_def_id -> measure_def_id` rename swept
// data_entries and measure_definitions but never touched the
// kpi_definitions.formula_inputs JSON. The KPI resolvers read `measure_def_id`
// and silently drop legacy-keyed inputs, so no KPI resolves its inputs. This
// normalises the stored data so it matches what the builder writes and what the
// resolver reads. Transactional, backed up, and idempotent.
//
// Run: node --env-file=.env --import tsx scripts/fix-kpi-formula-input-key.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BACKUP_TABLE = "kpi_formula_inputs_backup_20260723";

const LEGACY_PREDICATE = `
  formula_inputs IS NOT NULL
  AND jsonb_typeof(formula_inputs::jsonb) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(formula_inputs::jsonb) e
    WHERE (e ? 'input_def_id') AND NOT (e ? 'measure_def_id')
  )
`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const before = await client.query(
      `SELECT count(*) AS n FROM kpi_definitions WHERE ${LEGACY_PREDICATE};`,
    );
    console.log("KPI defs with legacy input_def_id key (before):", before.rows[0].n);

    // Snapshot the whole column so any row can be restored.
    await client.query(`CREATE SCHEMA IF NOT EXISTS backup;`);
    await client.query(`DROP TABLE IF EXISTS backup."${BACKUP_TABLE}";`);
    await client.query(
      `CREATE TABLE backup."${BACKUP_TABLE}" AS
       SELECT id, formula_inputs FROM kpi_definitions;`,
    );
    console.log(`Backup written: backup."${BACKUP_TABLE}"`);

    // Rewrite each element that carries input_def_id but not measure_def_id.
    const upd = await client.query(`
      UPDATE kpi_definitions
      SET formula_inputs = (
        SELECT jsonb_agg(
          CASE
            WHEN (elem ? 'input_def_id') AND NOT (elem ? 'measure_def_id')
              THEN (elem - 'input_def_id')
                   || jsonb_build_object('measure_def_id', elem->'input_def_id')
            ELSE elem
          END
          ORDER BY ord
        )::json
        FROM jsonb_array_elements(formula_inputs::jsonb)
             WITH ORDINALITY AS t(elem, ord)
      )
      WHERE ${LEGACY_PREDICATE};
    `);
    console.log("KPI defs updated:", upd.rowCount);

    const after = await client.query(`
      SELECT
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(formula_inputs::jsonb) e
          WHERE e ? 'input_def_id')) AS still_legacy,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(formula_inputs::jsonb) e
          WHERE e ? 'measure_def_id')) AS now_measure_keyed
      FROM kpi_definitions
      WHERE formula_inputs IS NOT NULL
        AND jsonb_typeof(formula_inputs::jsonb) = 'array';
    `);
    console.log("After — rows still carrying input_def_id:", after.rows[0].still_legacy);
    console.log("After — rows carrying measure_def_id:", after.rows[0].now_measure_keyed);

    await client.query("COMMIT");
    console.log("Committed.");
    console.log(
      `Revert with: UPDATE kpi_definitions k SET formula_inputs = b.formula_inputs ` +
        `FROM backup."${BACKUP_TABLE}" b WHERE b.id = k.id;`,
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
