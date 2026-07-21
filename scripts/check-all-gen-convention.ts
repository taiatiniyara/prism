// Read-only: understand the "All GEN" convention — are its resources virtual
// aggregates, and do All GEN rows coexist with per-source detail rows in the
// same (period, input, service area)? Also provider/type refs on resources.
// Run: node --env-file=.env --import tsx scripts/check-all-gen-convention.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const virt = await pool.query(`
    select is_virtual, is_aggregated, count(*)::int as resources
    from energy_resources where energy_source_id = 40
    group by is_virtual, is_aggregated
  `);
  console.log("All GEN resources by virtual/aggregated flags:");
  console.table(virt.rows);

  const provRefs = await pool.query(`
    select p.name as provider, t.name as type, count(*)::int as resources
    from energy_resources e
    left join managed_list_items p on p.id = e.energy_provider_id
    left join managed_list_items t on t.id = e.energy_type_id
    where e.energy_provider_id in (20, 23) or e.energy_type_id in (30, 33)
    group by p.name, t.name
  `);
  console.log("resources using provider 'All' (20) or type 'All' (30):");
  console.table(provRefs.rows);

  const coexist = await pool.query(`
    with allgen as (
      select report_period_id, measure_def_id, service_area_id
      from data_entries
      where energy_source_id = 40 and is_deleted = false
      group by 1, 2, 3
    ),
    detail as (
      select report_period_id, measure_def_id, service_area_id
      from data_entries
      where energy_source_id in (43,44,45,46,47,48,49,50,51,52,53,54,55,56,57)
        and is_deleted = false
      group by 1, 2, 3
    )
    select
      (select count(*)::int from allgen) as allgen_scopes,
      (select count(*)::int from detail) as detail_scopes,
      (select count(*)::int from allgen a
        join detail d using (report_period_id, measure_def_id, service_area_id)
      ) as overlapping_scopes
  `);
  console.log(
    "scope overlap (same period+input+service area has BOTH All GEN and per-source rows):",
  );
  console.table(coexist.rows);

  const sample = await pool.query(`
    select i.name as input, count(*)::int as rows_tagged_allgen
    from data_entries de
    join measure_definitions  i on i.id = de.measure_def_id
    where de.energy_source_id = 40 and de.is_deleted = false
    group by i.name
    order by count(*) desc
    limit 10
  `);
  console.log("top inputs tagged All GEN:");
  console.table(sample.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
