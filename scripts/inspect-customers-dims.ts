// Read-only: dimension shape of legacy customers rows (153) vs interruption
// event rows (1800/1803) — determines whether one calculation scope can see
// both, and why 153 has duplicate rows per scope.
// Run: node --env-file=.env --import tsx scripts/inspect-customers-dims.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const dims = await pool.query(`
    select input_def_id,
           count(*)::int as rows,
           count(*) filter (where energy_resource_id is not null)::int as with_resource,
           count(*) filter (where energy_source_id is not null)::int as with_source,
           count(*) filter (where energy_provider_id is not null)::int as with_provider,
           count(distinct energy_resource_id)::int as distinct_resources
    from data_entries
    where input_def_id in (153, 1800, 1803) and is_deleted = false
      and value is not null and trim(value) <> ''
    group by input_def_id order by input_def_id
  `);
  console.log("Dimension tagging per input:");
  console.table(dims.rows);

  const dups = await pool.query(`
    select report_period_id, service_area_id, count(*)::int as copies,
           count(distinct value)::int as distinct_values,
           count(distinct energy_resource_id)::int as distinct_resources
    from data_entries
    where input_def_id = 153 and is_deleted = false
      and value is not null and trim(value) <> ''
    group by 1, 2
    having count(*) > 1
    order by copies desc
    limit 5
  `);
  console.log("Duplicate 153 rows per (period, service area):");
  console.table(dups.rows);

  const dupTotal = await pool.query(`
    select count(*)::int as scopes_with_dups,
           sum(case when distinct_values > 1 then 1 else 0 end)::int as scopes_with_conflicting_values
    from (
      select report_period_id, service_area_id,
             count(*) as copies, count(distinct value) as distinct_values
      from data_entries
      where input_def_id = 153 and is_deleted = false
        and value is not null and trim(value) <> ''
      group by 1, 2 having count(*) > 1
    ) d
  `);
  console.table(dupTotal.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
