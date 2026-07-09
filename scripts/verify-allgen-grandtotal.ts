// Read-only: does All GEN behave like an all-providers grand total once the
// duplicate detail rows are de-duplicated? Compares All GEN (dedup) vs deduped
// sum of per-source detail (incl IPP) per scope for Electricity Generated.
// Run: node --env-file=.env --import tsx scripts/verify-allgen-grandtotal.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const cmp = await pool.query(`
    with allgen as (
      -- one value per (period, SA, resource): most recent
      select distinct on (report_period_id, service_area_id, energy_resource_id)
             report_period_id, service_area_id, value::numeric as total
      from data_entries
      where input_def_id = 1652 and energy_source_id = 40 and is_deleted = false
        and value ~ '^[0-9.]+$'
      order by report_period_id, service_area_id, energy_resource_id, updated_at desc
    ),
    allgen_scope as (
      select report_period_id, service_area_id, sum(total) as allgen_total
      from allgen group by 1, 2
    ),
    detail as (
      -- dedup per (period, SA, resource, source, provider): most recent value
      select distinct on (report_period_id, service_area_id, energy_resource_id,
                          energy_source_id, energy_provider_id)
             report_period_id, service_area_id, value::numeric as v,
             energy_provider_id
      from data_entries
      where input_def_id = 1652 and energy_source_id <> 40 and is_deleted = false
        and value ~ '^[0-9.]+$'
      order by report_period_id, service_area_id, energy_resource_id,
               energy_source_id, energy_provider_id, updated_at desc
    ),
    detail_scope as (
      select report_period_id, service_area_id,
             sum(v) as detail_total,
             sum(v) filter (where energy_provider_id = 22) as ipp_total
      from detail group by 1, 2
    )
    select a.report_period_id as period, a.service_area_id as sa,
           round(a.allgen_total, 1) as allgen,
           round(d.detail_total, 1) as detail_dedup,
           round(d.ipp_total, 1) as ipp_in_detail,
           round(a.allgen_total - d.detail_total, 1) as diff
    from allgen_scope a
    join detail_scope d using (report_period_id, service_area_id)
    order by a.report_period_id desc, a.service_area_id
    limit 15
  `);
  console.log("All GEN (dedup) vs deduped per-source detail sum:");
  console.table(cmp.rows);

  const agg = await pool.query(`
    with allgen as (
      select distinct on (report_period_id, service_area_id, energy_resource_id)
             report_period_id, service_area_id, value::numeric as total
      from data_entries
      where input_def_id = 1652 and energy_source_id = 40 and is_deleted = false
        and value ~ '^[0-9.]+$'
      order by report_period_id, service_area_id, energy_resource_id, updated_at desc
    ),
    allgen_scope as (select report_period_id, service_area_id, sum(total) t from allgen group by 1,2),
    detail as (
      select distinct on (report_period_id, service_area_id, energy_resource_id, energy_source_id, energy_provider_id)
             report_period_id, service_area_id, value::numeric as v
      from data_entries
      where input_def_id = 1652 and energy_source_id <> 40 and is_deleted = false and value ~ '^[0-9.]+$'
      order by report_period_id, service_area_id, energy_resource_id, energy_source_id, energy_provider_id, updated_at desc
    ),
    detail_scope as (select report_period_id, service_area_id, sum(v) t from detail group by 1,2)
    select count(*)::int as scopes,
           count(*) filter (where abs(a.t - d.t) / nullif(greatest(a.t, d.t),0) < 0.02)::int as within_2pct,
           count(*) filter (where a.t >= d.t)::int as allgen_ge_detail
    from allgen_scope a join detail_scope d using (report_period_id, service_area_id)
  `);
  console.log("Aggregate agreement:");
  console.table(agg.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
