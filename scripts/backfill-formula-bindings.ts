/**
 * Backfill formula_binding / formula_binding_dimension from the legacy
 * formula_inputs JSON for every active KPI / calculated measure that has a
 * formula + JSON inputs but no binding rows yet.
 *
 *   node --env-file=.env --import tsx scripts/backfill-formula-bindings.ts            # dry run
 *   node --env-file=.env --import tsx scripts/backfill-formula-bindings.ts --apply    # write
 *
 * Safe to re-run: only owners with ZERO binding rows are touched. Verified
 * equivalent: bindingToFormulaInput() reconstructs the exact FormulaInput[] the
 * JSON holds (spec §5.3; PR #330 confirmed byte-identical for all currently
 * bound owners).
 */
import { Pool } from "pg";

import { ALL_MEMBER } from "@/lib/data-entry/dimensions";

const DIMENSION_KEYS = Object.keys(ALL_MEMBER) as Array<keyof typeof ALL_MEMBER>;
const APPLY = process.argv.includes("--apply");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type Json = Record<string, unknown>;

const measureId = (fi: Json): number | null => {
  const raw = fi.measure_def_id ?? fi.input_def_id;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
};

async function backfill(
  ownerKind: "kpi" | "measure",
  table: "kpi_definitions" | "measure_definitions",
  extraWhere: string,
) {
  const { rows } = await pool.query<{
    id: number;
    name: string;
    formula_inputs: Json[] | null;
  }>(`
    select d.id, d.name, d.formula_inputs
    from ${table} d
    where d.is_active
      and d.formula is not null and trim(d.formula) <> ''
      and d.formula_inputs is not null
      and jsonb_array_length(d.formula_inputs::jsonb) > 0
      ${extraWhere}
      and not exists (
        select 1 from formula_binding b
        where b.owner_kind = '${ownerKind}' and b.owner_id = d.id
      )
  `);

  console.log(`\n${ownerKind}: ${rows.length} owner(s) to backfill`);
  let bindings = 0;
  let dims = 0;

  const client = await pool.connect();
  try {
    if (APPLY) await client.query("BEGIN");
    for (const row of rows) {
      const inputs = (row.formula_inputs ?? []).filter(
        (fi) => measureId(fi) != null && typeof fi.variable_name === "string",
      );
      for (let i = 0; i < inputs.length; i++) {
        const fi = inputs[i];
        const mId = measureId(fi)!;
        const varName = fi.variable_name as string;
        bindings++;
        if (!APPLY) {
          dims += DIMENSION_KEYS.length;
          continue;
        }
        const { rows: inserted } = await client.query<{ id: number }>(
          `insert into formula_binding
             (owner_kind, owner_id, variable_name, input_measure_def_id, grain_mode, sort_order)
           values ($1, $2, $3, $4, 'inherit', $5) returning id`,
          [ownerKind, row.id, varName, mId, i],
        );
        const bindingId = inserted[0].id;
        for (const key of DIMENSION_KEYS) {
          const member = Number(fi[key] ?? ALL_MEMBER[key]);
          await client.query(
            `insert into formula_binding_dimension (binding_id, dimension_key, member_id)
             values ($1, $2, $3)`,
            [bindingId, key, member],
          );
          dims++;
        }
      }
      console.log(`  [${row.id}] ${row.name}: ${inputs.length} binding(s)`);
    }
    if (APPLY) await client.query("COMMIT");
  } catch (e) {
    if (APPLY) await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  console.log(
    `${APPLY ? "wrote" : "would write"} ${bindings} formula_binding + ${dims} formula_binding_dimension rows`,
  );
}

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (pass --apply to write)");
  await backfill("kpi", "kpi_definitions", "");
  await backfill(
    "measure",
    "measure_definitions",
    "and d.is_calculated = true",
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
