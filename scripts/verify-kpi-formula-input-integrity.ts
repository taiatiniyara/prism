/**
 * Read-only integrity check across every KPI's formula_inputs. Written
 * during the 2026-09-25 audit that found 9 mis-pinned dimensions (KPIs
 * 62/63/78/79/80/82/89) and 1 orphaned measure reference (KPI 33). Re-run
 * after any formula-binding fix, and periodically as a regression guard.
 *
 *   node --env-file=.env --import tsx scripts/verify-kpi-formula-input-integrity.ts
 */
import { Client } from "pg";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let failed = false;

  // Check 1: two+ formula_inputs entries pinned to the EXACT same dimension
  // slice (measure + all 10 dims identical) — guaranteed miscalculation /
  // duplicate render, regardless of variable_name.
  const { rows: exactDupes } = await client.query(`
    with fi as (
      select kd.id as kpi_def_id, kd.name,
             fi_elem->>'variable_name' as variable_name,
             fi_elem->>'measure_def_id' as measure_def_id,
             fi_elem->>'provider_id' as provider_id,
             fi_elem->>'category_id' as category_id,
             fi_elem->>'technology_id' as technology_id,
             fi_elem->>'asset_class_id' as asset_class_id,
             fi_elem->>'customer_type_id' as customer_type_id,
             fi_elem->>'payment_mode_id' as payment_mode_id,
             fi_elem->>'consumption_band_id' as consumption_band_id,
             fi_elem->>'division_id' as division_id,
             fi_elem->>'gender_id' as gender_id,
             fi_elem->>'utility_function_id' as utility_function_id
      from kpi_definitions kd, jsonb_array_elements(kd.formula_inputs::jsonb) fi_elem
    )
    select kpi_def_id, name, array_agg(variable_name) as colliding_variables, count(*) as n
    from fi
    group by kpi_def_id, name, measure_def_id, provider_id, category_id, technology_id,
             asset_class_id, customer_type_id, payment_mode_id, consumption_band_id,
             division_id, gender_id, utility_function_id
    having count(*) > 1
    order by kpi_def_id
  `);
  if (exactDupes.length > 0) {
    failed = true;
    console.log("FAIL — exact-duplicate-slice collisions found:");
    for (const r of exactDupes) {
      console.log(` ${r.kpi_def_id} ${r.name} -> ${r.colliding_variables.join(" <-> ")}`);
    }
  } else {
    console.log("PASS — no exact-duplicate-slice collisions across all KPIs.");
  }

  // Check 2: formula_inputs referencing a measure_def_id that doesn't exist,
  // or that exists but is inactive.
  const { rows: orphans } = await client.query(`
    with fi as (
      select kd.id as kpi_def_id, kd.name,
             (fi_elem->>'measure_def_id')::int as measure_def_id,
             fi_elem->>'variable_name' as variable_name
      from kpi_definitions kd, jsonb_array_elements(kd.formula_inputs::jsonb) fi_elem
    )
    select fi.kpi_def_id, fi.name, fi.variable_name, fi.measure_def_id, md.is_active
    from fi
    left join measure_definitions md on md.id = fi.measure_def_id
    where md.id is null or md.is_active = false
  `);
  if (orphans.length > 0) {
    failed = true;
    console.log("FAIL — orphaned/inactive measure references found:");
    for (const r of orphans) {
      console.log(` ${r.kpi_def_id} ${r.name} -> ${r.variable_name} references measure_def_id ${r.measure_def_id} (is_active=${r.is_active ?? "MISSING"})`);
    }
  } else {
    console.log("PASS — every formula_inputs measure_def_id exists and is active.");
  }

  // Informational only (not a failure): active KPIs with no formula at all.
  const { rows: noFormula } = await client.query(`
    select id, name
    from kpi_definitions
    where is_active = true
      and (formula_inputs is null or jsonb_array_length(formula_inputs::jsonb) = 0)
    order by id
  `);
  console.log(
    `INFO — ${noFormula.length} active KPI(s) with no formula configured (not a regression check failure, needs a product decision):`,
  );
  for (const r of noFormula) console.log(`  ${r.id} ${r.name}`);

  await client.end();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
