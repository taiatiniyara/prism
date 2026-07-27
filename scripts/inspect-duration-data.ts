// Read-only: does customer-minutes duration data exist under 1802/1805 (or
// any duration-like input)? Check rows incl. deleted, and scope overlap with
// the customers-served input for SAIDI.
// Run: node --env-file=.env --import tsx scripts/inspect-duration-data.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const defs = await pool.query(`
    select i.id, i.name, i.variable_name, i.is_active, u.name as unit,
           al.name as strata
    from measure_definitions  i
    left join managed_list_items u on u.id = i.unit_id
    left join managed_list_items al on al.id = i.strata_id
    where i.id in (1802, 1805, 1808)
       or i.name ilike '%duration%' or i.name ilike '%customer minutes%'
       or i.name ilike '%interruption%duration%'
    order by i.id
  `);
  console.log("Duration-related input definitions:");
  console.table(defs.rows);

  const data = await pool.query(`
    select de.measure_def_id, de.is_deleted,
           count(*)::int as rows,
           count(*) filter (where de.value is not null and trim(de.value) <> '')::int as with_value,
           count(distinct de.report_period_id)::int as periods,
           count(distinct de.service_area_id)::int as service_areas,
           max(rp.report_date)::date as latest
    from data_entries de
    join report_periods rp on rp.id = de.report_period_id
    where de.measure_def_id in (1802, 1805, 1808)
    group by 1, 2 order by 1, 2
  `);
  console.log("Data rows for 1802 / 1805 / 1808 (incl deleted):");
  console.table(data.rows);

  const sample = await pool.query(`
    select de.measure_def_id, rp.report_date::date as period, sa.name as service_area,
           de.value, de.is_deleted, de.energy_provider_id, de.energy_source_id
    from data_entries de
    join report_periods rp on rp.id = de.report_period_id
    left join service_areas sa on sa.id = de.service_area_id
    where de.measure_def_id in (1802, 1805)
      and de.value is not null and trim(de.value) <> ''
    order by rp.report_date desc limit 10
  `);
  console.log("Sample duration values:");
  console.table(sample.rows);

  // Scope overlap with customers-served (1501) for SAIDI feasibility.
  const overlap = await pool.query(`
    with dur as (
      select report_period_id, service_area_id, energy_resource_id, measure_def_id
      from data_entries
      where measure_def_id in (1802, 1805) and is_deleted = false
        and value is not null and trim(value) <> '' and value ~ '^[0-9.]+$'
      group by 1,2,3,4
    ),
    cust as (
      select report_period_id, service_area_id, energy_resource_id
      from data_entries
      where measure_def_id = 1501 and is_deleted = false
        and value is not null and trim(value) <> '' and value ~ '^[0-9.]+$'
      group by 1,2,3
    )
    select dur.measure_def_id,
           count(*)::int as duration_scopes,
           count(*) filter (where c.report_period_id is not null)::int as with_customers
    from dur left join cust c
      on c.report_period_id = dur.report_period_id
     and c.service_area_id is not distinct from dur.service_area_id
     and c.energy_resource_id is not distinct from dur.energy_resource_id
    group by dur.measure_def_id
  `);
  console.log(
    "Duration scopes with customers-served available (SAIDI feasibility):",
  );
  console.table(overlap.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
