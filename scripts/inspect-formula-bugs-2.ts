// Read-only follow-up: (a) any input representing total customers served /
// connections / accounts? (b) do % -unit KPIs conventionally include *100?
// Run: node --env-file=.env --import tsx scripts/inspect-formula-bugs-2.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const cust = await pool.query(`
    select id, name, variable_name, is_active
    from measure_definitions 
    where name ilike '%customer%' or name ilike '%connection%'
       or name ilike '%consumer%' or name ilike '%account%'
       or variable_name ilike '%connection%' or variable_name ilike '%served%'
    order by is_active desc, name
    limit 40
  `);
  console.log("Customer-count candidate inputs (active first):");
  for (const r of cust.rows) {
    console.log(
      `  [${r.id}] active=${r.is_active} ${r.variable_name}  (${r.name})`,
    );
  }

  const pct = await pool.query(`
    select k.id, k.name, k.formula
    from kpi_definitions k
    join managed_list_items u on u.id = k.unit_id
    where u.name = '%' and k.is_active = true and k.formula is not null
      and trim(k.formula) <> ''
    order by k.id
    limit 30
  `);
  console.log("\nActive %-unit KPIs and whether formula includes *100:");
  for (const r of pct.rows) {
    const has100 = /100/.test(r.formula);
    console.log(
      `  [${r.id}] ${has100 ? "*100 YES" : "*100 no "} | ${r.name}: ${r.formula}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
