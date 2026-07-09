// Read-only: is the "All GEN" aggregate supposed to be provider=All(20) not
// Utility(21)? Establish current tagging, blast radius of a 21->20 retag, and
// whether All GEN generation already includes IPP (i.e. is provider-agnostic).
// Run: node --env-file=.env --import tsx scripts/inspect-allgen-provider.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const providers = await pool.query(`
    select id, name, parent_id from managed_list_items
    where id in (20, 21, 22) order by id
  `);
  console.log("Provider ids:");
  console.table(providers.rows);

  // All GEN (source=40) data rows by provider — the full blast radius.
  const byProvider = await pool.query(`
    select coalesce(p.name, '(null)') as provider, de.energy_provider_id,
           count(*)::int as rows,
           count(distinct de.input_def_id)::int as inputs
    from data_entries de
    left join managed_list_items p on p.id = de.energy_provider_id
    where de.energy_source_id = 40 and de.is_deleted = false
    group by 1, 2 order by rows desc
  `);
  console.log("All GEN (source=40) data rows by provider:");
  console.table(byProvider.rows);

  // The 92 virtual All GEN resources by provider.
  const resByProvider = await pool.query(`
    select coalesce(p.name, '(null)') as provider, count(*)::int as resources
    from energy_resources e
    left join managed_list_items p on p.id = e.energy_provider_id
    where e.energy_source_id = 40
    group by 1 order by resources desc
  `);
  console.log("All GEN virtual resources by provider:");
  console.table(resByProvider.rows);

  // KPI/input formula bindings that pin provider=21 (would need updating).
  const kpiBind = await pool.query(`
    select k.id, k.name, fi.value->>'variable_name' as var
    from kpi_definitions k, jsonb_array_elements(k.formula_inputs::jsonb) fi
    where (fi.value->>'energy_provider_id') = '21'
    order by k.id
  `);
  console.log(`KPI bindings pinning provider=21: ${kpiBind.rowCount}`);
  console.table(kpiBind.rows);

  const inputBind = await pool.query(`
    select i.id, i.name, fi.value->>'variable_name' as var
    from input_definitions i, jsonb_array_elements(i.formula_inputs::jsonb) fi
    where (fi.value->>'energy_provider_id') = '21'
    order by i.id
  `);
  console.log(`Input (aggregated) bindings pinning provider=21: ${inputBind.rowCount}`);
  console.table(inputBind.rows);

  // Does the All GEN generation total already include IPP? Compare, per scope,
  // the All GEN row value against the sum of per-source detail rows (which
  // include IPP provider=22). If All GEN ~= sum(detail incl IPP), it is
  // provider-agnostic and belongs at provider=All(20).
  const cmp = await pool.query(`
    with allgen as (
      select report_period_id, service_area_id, energy_resource_id,
             max(value::numeric) as total
      from data_entries
      where input_def_id = 1652 and energy_source_id = 40 and is_deleted = false
        and value ~ '^[0-9.]+$'
      group by 1, 2, 3
    ),
    detail as (
      select report_period_id, service_area_id,
             sum(value::numeric) as sum_detail,
             bool_or(energy_provider_id = 22) as has_ipp
      from data_entries
      where input_def_id = 1652 and energy_source_id <> 40 and is_deleted = false
        and value ~ '^[0-9.]+$'
      group by 1, 2
    )
    select a.report_period_id, a.service_area_id, a.total as allgen_total,
           d.sum_detail, d.has_ipp
    from allgen a
    join detail d using (report_period_id, service_area_id)
    order by a.report_period_id desc
    limit 12
  `);
  console.log("All GEN total vs sum of per-source detail (same period+SA):");
  console.table(cmp.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
