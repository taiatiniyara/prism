// Read-only: current state of the 5 KPI definitions named in
// DATA-QUALITY-FINDINGS items 1-4, plus their female/unplanned counterparts
// and the candidate inputs for corrected denominators.
// Run: node --env-file=.env --import tsx scripts/inspect-formula-bugs.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const kpis = await pool.query(`
    select k.id, k.name, k.formula, k.formula_inputs, u.name as unit, al.name as agg_level, k.is_active
    from kpi_definitions k
    left join managed_list_items u on u.id = k.unit_id
    left join managed_list_items al on al.id = k.agg_level_id
    where k.name in (
      'Total Employees Male', 'Total Employees Female',
      'Planned SAIDI', 'Planned SAIFI', 'Unplanned SAIDI', 'Unplanned SAIFI',
      'SAIDI', 'SAIFI',
      'Generator Availability Factor', 'Engine Oil Consumption'
    )
    order by k.name
  `);
  for (const r of kpis.rows) {
    console.log(`\n[${r.id}] ${r.name} | unit=${r.unit} | level=${r.agg_level} | active=${r.is_active}`);
    console.log(`  formula: ${r.formula}`);
    console.log(`  inputs:  ${JSON.stringify(r.formula_inputs)}`);
  }

  const inputs = await pool.query(`
    select id, name, variable_name, is_active
    from input_definitions
    where is_active = true and (
      variable_name ilike '%customer%' or variable_name ilike '%employees_male%'
      or variable_name ilike '%employees_female%' or variable_name ilike '%hours%'
      or variable_name ilike '%oil%' or variable_name ilike '%generated%'
      or variable_name ilike '%interrupt%' or variable_name ilike '%outage%'
      or variable_name ilike '%affected%' or variable_name ilike '%human_resource%'
    )
    order by variable_name
  `);
  console.log("\nCandidate active inputs:");
  for (const r of inputs.rows) {
    console.log(`  [${r.id}] ${r.variable_name}  (${r.name})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
