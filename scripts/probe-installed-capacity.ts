import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

(async () => {
  const q = async (label: string, sql: string, params: unknown[] = []) => {
    const r = await pool.query(sql, params);
    console.log(`\n=== ${label} (${r.rowCount} rows) ===`);
    console.table(r.rows.slice(0, 20));
  };

  // 1. Inputs whose name contains "installed" or "capacity"
  await q(
    "input_definitions matching 'installed' or 'capacity'",
    `select id, name, variable_name, is_kpi, is_active,
            (select name from managed_list_items where id = unit_id) as unit,
            (select name from managed_list_items where id = data_type_id) as data_type,
            (select name from managed_list_items where id = category_id) as category
       from input_definitions
      where (name ilike '%installed%' or name ilike '%capacity%' or variable_name ilike '%capacity%')
        and is_active = true
      order by name`,
  );

  // 2. Solar managed_list_items in Energy Source
  await q(
    "Energy Source items containing 'solar'",
    `select mli.id, mli.name, ml.name as list_name, mli.is_active
       from managed_list_items mli
       join managed_lists ml on ml.id = mli.list_id
      where ml.name = 'Energy Source' and mli.name ilike '%solar%'`,
  );

  // 3. data_entries for any input matching installed/capacity in 2024-ish periods
  await q(
    "data_entries for installed-capacity inputs in periods containing '2024'",
    `select de.id, de.input_def_id, idf.name as input_name,
            de.value, de.status_id, de.report_period_id,
            rp.report_period as period_label,
            (select name from managed_list_items where id = de.energy_source_id) as energy_source,
            de.is_deleted, de.is_relevant
       from data_entries de
       join input_definitions idf on idf.id = de.input_def_id
       join report_periods rp on rp.id = de.report_period_id
      where (idf.name ilike '%installed%' or idf.name ilike '%capacity%')
        and rp.report_period like '%2024%'
      order by idf.name
      limit 30`,
  );

  // 4. Same but only Solar dimension
  await q(
    "data_entries for installed-capacity + Solar energy_source in 2024",
    `select de.id, idf.name as input_name, de.value, de.status_id,
            rp.report_period,
            (select name from managed_list_items where id = de.energy_source_id) as energy_source,
            de.is_deleted, de.is_relevant
       from data_entries de
       join input_definitions idf on idf.id = de.input_def_id
       join report_periods rp on rp.id = de.report_period_id
      where (idf.name ilike '%installed%' or idf.name ilike '%capacity%')
        and rp.report_period like '%2024%'
        and de.energy_source_id in (
          select mli.id from managed_list_items mli
          join managed_lists ml on ml.id = mli.list_id
          where ml.name='Energy Source' and mli.name ilike '%solar%'
        )`,
  );

  // 5. Show what report_periods columns/structure look like
  await q(
    "sample report_periods",
    `select id, report_period, utility_id from report_periods order by id desc limit 10`,
  );

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
