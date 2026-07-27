// Read-only: can input 1501 (Electricity Customers (Metered Connections))
// serve as the SAIDI/SAIFI denominator? Checks its definition, data coverage,
// and scope overlap with the interruption inputs.
// Run: node --env-file=.env --import tsx scripts/inspect-customers-served.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const INPUTS = {
  customers: 1501,
  plannedDuration: 1802,
  plannedEvents: 1800,
  plannedAffected: 1801,
  unplannedDuration: 1805,
  unplannedEvents: 1803,
};

async function main() {
  const def = await pool.query(
    `select i.id, i.name, i.variable_name, i.is_active, i.is_aggregated,
            al.name as strata, u.name as unit, c.name as category, sc.name as subcategory
     from measure_definitions  i
     left join managed_list_items al on al.id = i.strata_id
     left join managed_list_items u on u.id = i.unit_id
     left join managed_list_items c on c.id = i.category_id
     left join managed_list_items sc on sc.id = i.subcategory_id
     where i.id = any($1::int[])
     order by i.id`,
    [Object.values(INPUTS)],
  );
  console.log("Definitions:");
  for (const r of def.rows) {
    console.log(
      `  [${r.id}] ${r.variable_name} | active=${r.is_active} | level=${r.strata} | unit=${r.unit} | ${r.category}/${r.subcategory}`,
    );
  }

  const coverage = await pool.query(
    `select de.measure_def_id, count(*)::int as rows,
            count(distinct de.report_period_id)::int as periods,
            count(distinct de.service_area_id)::int as service_areas,
            count(*) filter (where de.value is not null and trim(de.value) <> '')::int as with_value,
            max(rp.report_date)::date as latest_period
     from data_entries de
     join report_periods rp on rp.id = de.report_period_id
     where de.measure_def_id = any($1::int[]) and de.is_deleted = false
     group by de.measure_def_id
     order by de.measure_def_id`,
    [Object.values(INPUTS)],
  );
  console.log("\nData coverage per input:");
  console.table(coverage.rows);

  // Scope overlap: of the scopes (period+service area) that have planned
  // interruption data, how many also have a customers value?
  const overlap = await pool.query(
    `with interruption as (
       select report_period_id, service_area_id
       from data_entries
       where measure_def_id in ($2, $3) and is_deleted = false
         and value is not null and trim(value) <> ''
       group by 1, 2
     ),
     customers as (
       select report_period_id, service_area_id
       from data_entries
       where measure_def_id = $1 and is_deleted = false
         and value is not null and trim(value) <> ''
       group by 1, 2
     )
     select
       (select count(*)::int from interruption) as interruption_scopes,
       (select count(*)::int from customers) as customer_scopes,
       (select count(*)::int from interruption i join customers c using (report_period_id, service_area_id)) as both_scopes`,
    [INPUTS.customers, INPUTS.plannedDuration, INPUTS.plannedEvents],
  );
  console.log(
    "scope overlap (period+service area with planned-interruption data vs customers data):",
  );
  console.table(overlap.rows);

  const sample = await pool.query(
    `select rp.report_date::date as period, o.name as utility, sa.name as service_area, de.value
     from data_entries de
     join report_periods rp on rp.id = de.report_period_id
     left join organisations o on o.id = rp.utility_id
     left join service_areas sa on sa.id = de.service_area_id
     where de.measure_def_id = $1 and de.is_deleted = false
       and de.value is not null and trim(de.value) <> ''
     order by rp.report_date desc
     limit 8`,
    [INPUTS.customers],
  );
  console.log("latest customers (metered connections) values:");
  console.table(sample.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
