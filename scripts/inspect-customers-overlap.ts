// Read-only: scope shape of legacy input 153 (Electricity Customers) and its
// overlap with the interruption-event inputs (1800 planned / 1803 unplanned).
// Run: node --env-file=.env --import tsx scripts/inspect-customers-overlap.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const shape = await pool.query(`
    select count(*)::int as rows,
           count(distinct report_period_id)::int as periods,
           count(distinct service_area_id)::int as service_areas,
           count(*) filter (where service_area_id is null)::int as null_service_area,
           count(*) filter (where energy_source_id is not null)::int as with_source,
           bool_and(value ~ '^[0-9., ]+$')::text as all_numeric
    from data_entries
    where input_def_id = 153 and is_deleted = false
      and value is not null and trim(value) <> ''
  `);
  console.log("Input 153 row shape:");
  console.table(shape.rows);

  const overlap = await pool.query(`
    with ev as (
      select report_period_id, service_area_id, input_def_id
      from data_entries
      where input_def_id in (1800, 1803) and is_deleted = false
        and value is not null and trim(value) <> ''
      group by 1, 2, 3
    ),
    cust as (
      select report_period_id, service_area_id
      from data_entries
      where input_def_id = 153 and is_deleted = false
        and value is not null and trim(value) <> ''
      group by 1, 2
    )
    select ev.input_def_id,
           count(*)::int as event_scopes,
           count(*) filter (where cust.report_period_id is not null)::int as with_customers_same_scope,
           count(*) filter (where cust2.report_period_id is not null)::int as with_customers_same_period_null_sa
    from ev
    left join cust on cust.report_period_id = ev.report_period_id
                  and cust.service_area_id is not distinct from ev.service_area_id
    left join cust cust2 on cust2.report_period_id = ev.report_period_id
                  and cust2.service_area_id is null
    group by ev.input_def_id
  `);
  console.log("Interruption-event scopes with a customers value available:");
  console.table(overlap.rows);

  const sample = await pool.query(`
    select rp.report_date::date as period, o.name as utility, sa.name as service_area, de.value
    from data_entries de
    join report_periods rp on rp.id = de.report_period_id
    left join organisations o on o.id = rp.utility_id
    left join service_areas sa on sa.id = de.service_area_id
    where de.input_def_id = 153 and de.is_deleted = false
      and de.value is not null and trim(de.value) <> ''
    order by rp.report_date desc limit 6
  `);
  console.log("Sample latest 153 values:");
  console.table(sample.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
