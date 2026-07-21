// Canonicalize customers-served: copy deduped legacy rows (input 153,
// "Electricity Customers") to input 1501 ("Electricity Customers (Metered
// Connections)") preserving all scope/dimension tags, and activate 1501.
// Idempotent: skips scopes that already have a 1501 row; legacy 153 rows are
// left untouched. Safe to re-run and to run on prod.
// Run: node --env-file=.env --import tsx scripts/migrate-customers-served.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const activated = await client.query(
      `update measure_definitions  set is_active = true, updated_at = now()
       where id = 1501 and is_active = false`,
    );
    console.log(
      activated.rowCount === 1
        ? "ACTIVATED input 1501 (Electricity Customers (Metered Connections))"
        : "input 1501 already active",
    );

    const inserted = await client.query(`
      insert into data_entries (
        report_period_id, energy_resource_id, power_station_id, service_area_id,
        utility_id, country_id, subregion_id, region, measure_def_id, value,
        comments, update_medium_id, status_id, is_relevant, is_deleted,
        energy_provider_id, energy_source_id, customer_type_id, payment_mode_id,
        updated_by_id
      )
      select distinct on (
          de.report_period_id, de.service_area_id, de.energy_resource_id,
          de.energy_source_id, de.energy_provider_id, de.customer_type_id,
          de.payment_mode_id)
        de.report_period_id, de.energy_resource_id, de.power_station_id,
        de.service_area_id, de.utility_id, de.country_id, de.subregion_id,
        de.region, 1501, de.value, de.comments, de.update_medium_id,
        de.status_id, de.is_relevant, false, de.energy_provider_id,
        de.energy_source_id, de.customer_type_id, de.payment_mode_id,
        de.updated_by_id
      from data_entries de
      where de.measure_def_id = 153 and de.is_deleted = false
        and de.value is not null and trim(de.value) <> ''
        and not exists (
          select 1 from data_entries t
          where t.measure_def_id = 1501 and t.is_deleted = false
            and t.report_period_id = de.report_period_id
            and t.service_area_id is not distinct from de.service_area_id
            and t.energy_resource_id is not distinct from de.energy_resource_id
            and t.energy_source_id is not distinct from de.energy_source_id
            and t.energy_provider_id is not distinct from de.energy_provider_id
            and t.customer_type_id is not distinct from de.customer_type_id
            and t.payment_mode_id is not distinct from de.payment_mode_id
        )
      order by de.report_period_id, de.service_area_id, de.energy_resource_id,
               de.energy_source_id, de.energy_provider_id, de.customer_type_id,
               de.payment_mode_id, de.updated_at desc
    `);
    console.log(`INSERTED ${inserted.rowCount} deduped rows as input 1501`);

    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  const check = await pool.query(`
    select count(*)::int as rows,
           count(distinct report_period_id)::int as periods,
           count(distinct service_area_id)::int as service_areas
    from data_entries
    where measure_def_id = 1501 and is_deleted = false
      and value is not null and trim(value) <> ''
  `);
  console.log("Post-migration 1501 coverage:");
  console.table(check.rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
