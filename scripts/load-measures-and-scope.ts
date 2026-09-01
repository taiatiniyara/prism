/* ⚠️ STALE (2026-08-17) — DO NOT RUN AS-IS. References DB columns renamed away:
 * category_id → measures_group_id, subcategory_id → measures_subgroup_id (the INSERT/UPDATE
 * below error against the current schema). Also predates is_mandatory/is_apportionable and
 * TRUNCATEs measure_dimension_scope. The live measure_definitions catalogue is now the source
 * of truth (118 measures, curated). See docs/measures-enrichment/README.md before any reuse. */
/**
 * Loads the finalised measures catalogue + dimension scope into the dev DB.
 *   1. Upsert 114 enriched measures into measure_definitions (by id).
 *   2. Deactivate every other measure_definitions row (is_active=false).
 *   3. Replace measure_dimension_scope with the 1140 finalised rows.
 * Idempotent; wrapped in a transaction. Run on prod at migration time too.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

const measures = JSON.parse(readFileSync("docs/measures-enrichment/measures-enriched-final.json", "utf8"));
const scope = JSON.parse(readFileSync("docs/measures-enrichment/measure-dimension-scope-final.json", "utf8"));

const jnull = (v: any) => (v == null || v === "" ? null : v);
const num = (v: any) => (v == null || v === "" ? null : Number(v));
// FK id columns use 0 as a "none" sentinel in the source — map to NULL
const fkNull = (v: any) => (v == null || v === "" || Number(v) === 0 ? null : Number(v));

async function main() {
  const ids = measures.map((m: any) => m.id);

  await db.transaction(async (tx) => {
    // 1. Upsert the 114
    for (const m of measures) {
      await tx.execute(sql`
        INSERT INTO measure_definitions
          (id, name, variable_name, definition, synonyms, alternative_names, definition_status,
           category_id, subcategory_id, unit_id, data_type_id, strata_id, sort_order,
           valid_polarity_id, valid_trend_id, valid_range_min, valid_range_max,
           is_currency, is_calculated, is_active, formula, formula_inputs, updated_at)
        VALUES
          (${m.id}, ${m.name}, ${jnull(m.variable_name)}, ${jnull(m.definition)},
           ${m.synonyms ? sql`${m.synonyms}::json` : null},
           ${m.alternative_names ? sql`${m.alternative_names}::json` : null},
           ${jnull(m.definition_status)},
           ${m.category_id}, ${m.subcategory_id}, ${m.unit_id}, ${m.data_type_id}, ${jnull(m.strata_id)},
           ${m.sort_order == null ? 0 : Number(m.sort_order)},
           ${fkNull(m.valid_polarity_id)}, ${fkNull(m.valid_trend_id)}, ${num(m.valid_range_min)}, ${num(m.valid_range_max)},
           ${m.is_currency === true}, ${m.is_calculated === true}, ${m.is_active !== false},
           ${jnull(m.formula)}, ${m.formula_inputs ? sql`${m.formula_inputs}::json` : null}, now())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, variable_name = EXCLUDED.variable_name,
          definition = EXCLUDED.definition, synonyms = EXCLUDED.synonyms,
          alternative_names = EXCLUDED.alternative_names, definition_status = EXCLUDED.definition_status,
          category_id = EXCLUDED.category_id, subcategory_id = EXCLUDED.subcategory_id,
          unit_id = EXCLUDED.unit_id, data_type_id = EXCLUDED.data_type_id, strata_id = EXCLUDED.strata_id,
          sort_order = EXCLUDED.sort_order, valid_polarity_id = EXCLUDED.valid_polarity_id,
          valid_trend_id = EXCLUDED.valid_trend_id, valid_range_min = EXCLUDED.valid_range_min,
          valid_range_max = EXCLUDED.valid_range_max, is_currency = EXCLUDED.is_currency,
          is_calculated = EXCLUDED.is_calculated, is_active = EXCLUDED.is_active,
          formula = EXCLUDED.formula, formula_inputs = EXCLUDED.formula_inputs, updated_at = now()`);
    }

    // 2. Deactivate everything not in the 114
    const deact = await tx.execute(sql`
      UPDATE measure_definitions SET is_active = false, updated_at = now()
      WHERE id NOT IN (${sql.join(ids.map((i: number) => sql`${i}`), sql`, `)}) AND is_active = true
      RETURNING id`);
    console.log("deactivated non-catalogue rows:", ((deact.rows ?? deact) as unknown[]).length);

    // keep the id sequence ahead of any explicit ids
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('measure_definitions','id'), (SELECT max(id) FROM measure_definitions))`);

    // 3. Replace scope
    await tx.execute(sql`TRUNCATE TABLE measure_dimension_scope`);
    for (const s of scope) {
      await tx.execute(sql`
        INSERT INTO measure_dimension_scope (measure_id, dimension, expansion_mode)
        VALUES (${s.measure_id}, ${s.dimension}, ${s.expansion_mode})`);
    }
  });

  // Verify
  const v = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM measure_definitions WHERE is_active)::int AS active_measures,
      (SELECT count(*) FROM measure_definitions WHERE is_active AND formula IS NOT NULL)::int AS with_formula,
      (SELECT count(*) FROM measure_definitions WHERE is_active AND definition IS NOT NULL)::int AS with_definition,
      (SELECT count(*) FROM measure_dimension_scope)::int AS scope_rows,
      (SELECT count(*) FROM measure_dimension_scope WHERE expansion_mode='by_context')::int AS by_context`);
  console.log("VERIFY:", JSON.stringify((v.rows ?? v)[0]));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
