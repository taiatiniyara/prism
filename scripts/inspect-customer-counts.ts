// Read-only: which inputs measured in Customers/Connections actually have
// data? Is the customers-served number landing under a different definition?
// Run: node --env-file=.env --import tsx scripts/inspect-customer-counts.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const rows = await pool.query(`
    select i.id, i.variable_name, i.name, i.is_active, al.name as agg_level,
           u.name as unit,
           count(de.id) filter (where de.is_deleted = false
             and de.value is not null and trim(de.value) <> '')::int as rows_with_value,
           max(rp.report_date)::date as latest
    from input_definitions i
    left join managed_list_items u on u.id = i.unit_id
    left join managed_list_items al on al.id = i.agg_level_id
    left join data_entries de on de.input_def_id = i.id
    left join report_periods rp on rp.id = de.report_period_id
    where u.name in ('Customers', 'Connections', 'Consumers', 'Accounts', 'Number')
       or i.name ilike '%connection%' or i.name ilike '%customers%'
    group by i.id, i.variable_name, i.name, i.is_active, al.name, u.name
    having count(de.id) filter (where de.is_deleted = false
             and de.value is not null and trim(de.value) <> '') > 0
    order by rows_with_value desc
    limit 25
  `);
  console.log("Customer-ish inputs that HAVE data:");
  for (const r of rows.rows) {
    console.log(
      `  [${r.id}] ${r.variable_name} (${r.name}) | active=${r.is_active} | level=${r.agg_level} | unit=${r.unit} | rows=${r.rows_with_value} | latest=${r.latest?.toISOString?.().slice(0, 10) ?? r.latest}`,
    );
  }
  if (rows.rowCount === 0) console.log("  (none)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
