// Read-only: find customer-minutes duration data WHEREVER it landed on this DB.
// (1) any Minutes-unit input with data; (2) every Interruptions-subcategory
// input and its row count; (3) the exact DB host we're connected to.
// Run: node --env-file=.env --import tsx scripts/find-duration-anywhere.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const host = await pool.query(
    `select current_database() as db, inet_server_addr()::text as server_ip`,
  );
  console.log("Connected to:", host.rows[0]);

  const minutes = await pool.query(`
    select i.id, i.name, i.is_active,
           count(de.id) filter (where de.is_deleted = false
             and de.value is not null and trim(de.value) <> '')::int as rows_with_value
    from input_definitions i
    join managed_list_items u on u.id = i.unit_id and u.name = 'Minutes'
    left join data_entries de on de.input_def_id = i.id
    group by i.id, i.name, i.is_active
    order by rows_with_value desc, i.id
  `);
  console.log("All Minutes-unit inputs and their data:");
  console.table(minutes.rows);

  const interruptions = await pool.query(`
    select i.id, i.name, i.is_active, u.name as unit,
           count(de.id) filter (where de.is_deleted = false
             and de.value is not null and trim(de.value) <> '')::int as rows_with_value,
           max(rp.report_date)::date as latest
    from input_definitions i
    left join managed_list_items u on u.id = i.unit_id
    left join managed_list_items sc on sc.id = i.subcategory_id
    left join data_entries de on de.input_def_id = i.id
    left join report_periods rp on rp.id = de.report_period_id
    where sc.name ilike '%interruption%' or i.name ilike '%interruption%'
    group by i.id, i.name, i.is_active, u.name
    order by i.id
  `);
  console.log("All Interruptions inputs and their data:");
  console.table(interruptions.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
