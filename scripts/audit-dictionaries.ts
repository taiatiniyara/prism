import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

async function main() {
  const inputStats = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE is_active)::int AS active,
      count(*) FILTER (WHERE description IS NOT NULL AND length(trim(description)) > 0)::int AS has_description,
      count(*) FILTER (WHERE description IS NOT NULL AND length(trim(description)) >= 40)::int AS has_substantive_description,
      count(*) FILTER (WHERE variable_name IS NOT NULL AND length(trim(variable_name)) > 0)::int AS has_variable_name,
      count(*) FILTER (WHERE alternative_names IS NOT NULL AND alternative_names::text NOT IN ('{}', 'null'))::int AS has_alt_names,
      round(avg(length(trim(description))) FILTER (WHERE description IS NOT NULL AND length(trim(description)) > 0))::int AS avg_desc_len
    FROM input_definitions
  `);

  const kpiStats = await db.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE is_active)::int AS active,
      count(*) FILTER (WHERE type = 'benchmarking')::int AS benchmarking,
      count(*) FILTER (WHERE type = 'custom')::int AS custom,
      count(*) FILTER (WHERE description IS NOT NULL AND length(trim(description)) > 0)::int AS has_description,
      count(*) FILTER (WHERE description IS NOT NULL AND length(trim(description)) >= 40)::int AS has_substantive_description,
      count(*) FILTER (WHERE formula IS NOT NULL AND length(trim(formula)) > 0)::int AS has_formula,
      count(*) FILTER (WHERE formula_inputs IS NOT NULL AND jsonb_array_length(formula_inputs::jsonb) > 0)::int AS has_formula_inputs,
      count(*) FILTER (WHERE limits IS NOT NULL AND limits::text NOT IN ('[]', 'null'))::int AS has_limits,
      count(*) FILTER (WHERE targets IS NOT NULL AND targets::text NOT IN ('[]', 'null'))::int AS has_targets,
      round(avg(length(trim(description))) FILTER (WHERE description IS NOT NULL AND length(trim(description)) > 0))::int AS avg_desc_len
    FROM kpi_definitions
  `);

  const inputSamples = await db.execute(sql`
    SELECT i.id, i.name, i.variable_name, left(coalesce(i.description,''), 80) AS description,
           c.name AS category, u.name AS unit
    FROM input_definitions i
    LEFT JOIN managed_list_items c ON c.id = i.category_id
    LEFT JOIN managed_list_items u ON u.id = i.unit_id
    WHERE i.is_active
    ORDER BY random()
    LIMIT 12
  `);

  const kpiSamples = await db.execute(sql`
    SELECT k.id, k.name, left(coalesce(k.description,''), 80) AS description,
           left(coalesce(k.formula,''), 60) AS formula, k.type
    FROM kpi_definitions k
    WHERE k.is_active
    ORDER BY random()
    LIMIT 12
  `);

  const varNamePatterns = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE variable_name ~ '^[a-z][a-z0-9_]*$')::int AS snake_case,
      count(*) FILTER (WHERE variable_name ~ '[A-Z]')::int AS has_uppercase,
      count(*) FILTER (WHERE variable_name ~ '\s')::int AS has_spaces,
      count(*) FILTER (WHERE variable_name IS NULL OR trim(variable_name) = '')::int AS missing
    FROM input_definitions WHERE is_active
  `);

  console.log("=== INPUT DEFINITIONS ===");
  console.log(JSON.stringify(inputStats.rows ?? inputStats, null, 1));
  console.log("=== KPI DEFINITIONS ===");
  console.log(JSON.stringify(kpiStats.rows ?? kpiStats, null, 1));
  console.log("=== INPUT VARIABLE NAME PATTERNS ===");
  console.log(JSON.stringify(varNamePatterns.rows ?? varNamePatterns, null, 1));
  console.log("=== INPUT SAMPLES ===");
  console.log(JSON.stringify(inputSamples.rows ?? inputSamples, null, 1));
  console.log("=== KPI SAMPLES ===");
  console.log(JSON.stringify(kpiSamples.rows ?? kpiSamples, null, 1));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
