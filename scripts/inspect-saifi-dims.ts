// Read-only: exact dimension tags on the rows the corrected SAIFI (and Engine
// Oil) bindings must match, plus resource alignment between events and
// customers rows within each scope.
// Run: node --env-file=.env --import tsx scripts/inspect-saifi-dims.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const tags = await pool.query(`
    select de.measure_def_id, de.energy_provider_id, de.energy_source_id,
           src.parent_id as derived_type_id, count(*)::int as rows
    from data_entries de
    left join managed_list_items src on src.id = de.energy_source_id
    where de.measure_def_id in (153, 1800, 1803, 1652, 1659)
      and de.is_deleted = false and de.value is not null and trim(de.value) <> ''
    group by 1, 2, 3, 4
    order by de.measure_def_id, rows desc
  `);
  console.log(
    "Distinct dimension tags per input (provider, source, derived type):",
  );
  console.table(tags.rows);

  const align = await pool.query(`
    with ev as (
      select report_period_id, service_area_id, energy_resource_id, measure_def_id
      from data_entries
      where measure_def_id in (1800, 1803) and is_deleted = false
        and value is not null and trim(value) <> ''
      group by 1, 2, 3, 4
    ),
    cust as (
      select report_period_id, service_area_id, energy_resource_id
      from data_entries
      where measure_def_id = 153 and is_deleted = false
        and value is not null and trim(value) <> ''
      group by 1, 2, 3
    )
    select ev.measure_def_id,
           count(*)::int as event_scopes,
           count(*) filter (where c.report_period_id is not null)::int as customers_same_resource_scope
    from ev
    left join cust c on c.report_period_id = ev.report_period_id
      and c.service_area_id is not distinct from ev.service_area_id
      and c.energy_resource_id is not distinct from ev.energy_resource_id
    group by ev.measure_def_id
  `);
  console.log(
    "Events scopes where customers exist on the SAME (period, SA, resource):",
  );
  console.table(align.rows);

  const stratas = await pool.query(`
    select i.id, i.variable_name, al.id as strata_id, al.name as strata
    from measure_definitions  i
    left join managed_list_items al on al.id = i.strata_id
    where i.id in (1501, 1800, 1803)
  `);
  console.log("Agg levels:");
  console.table(stratas.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
