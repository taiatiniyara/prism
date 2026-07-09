// Read-only: why does Engine Oil (106) still not resolve? Show the actual
// rows for 1652/1659 in the scope the verifier picks, with every column the
// engine filters on.
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const [scope] = (
    await pool.query(`
      select n.report_period_id, n.service_area_id, n.energy_resource_id,
             rp.report_date::date as period
      from data_entries n
      join data_entries d
        on d.report_period_id = n.report_period_id
       and d.service_area_id is not distinct from n.service_area_id
       and d.energy_resource_id is not distinct from n.energy_resource_id
       and d.input_def_id = 1659 and d.is_deleted = false
       and d.value is not null and trim(d.value) <> ''
      join report_periods rp on rp.id = n.report_period_id
      where n.input_def_id = 1652 and n.is_deleted = false
        and n.value is not null and trim(n.value) <> ''
        and n.value ~ '^[0-9.]+$' and d.value ~ '^[0-9.]+$'
        and d.value::numeric <> 0
        and n.customer_type_id is null and n.payment_mode_id is null
        and d.customer_type_id is null and d.payment_mode_id is null
      order by rp.report_date desc limit 1
    `)
  ).rows;
  console.log("Chosen scope:", scope);

  const rows = await pool.query(
    `select input_def_id, value, is_relevant, is_deleted, service_area_id,
            energy_resource_id, energy_provider_id, energy_source_id,
            customer_type_id, payment_mode_id
     from data_entries
     where input_def_id in (1652, 1659)
       and report_period_id = $1
       and service_area_id is not distinct from $2
       and energy_resource_id is not distinct from $3`,
    [scope.report_period_id, scope.service_area_id, scope.energy_resource_id],
  );
  console.table(rows.rows);

  const agg = await pool.query(
    `select 'kpi 106' as what, agg_level_id from kpi_definitions where id = 106
     union all
     select 'input ' || id::text, agg_level_id from input_definitions where id in (1652, 1659)`,
  );
  console.table(agg.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
