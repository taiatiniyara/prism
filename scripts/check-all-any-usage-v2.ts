// Read-only: enumerate Energy Source / Energy Type / Energy Provider lists,
// find "All *" dummy entries, and count references in data_entries and
// formula bindings. Run: node --env-file=.env --import tsx scripts/check-all-any-usage-v2.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const items = await pool.query(`
    select ml.name as list, mli.id, mli.name, mli.parent_id,
           p.name as parent_name, mli.is_active
    from managed_list_items mli
    join managed_lists ml on ml.id = mli.list_id
    left join managed_list_items p on p.id = mli.parent_id
    where ml.name in ('Energy Source', 'Energy Type', 'Energy Provider')
    order by ml.name, mli.name
  `);
  console.log("Dimension lists:");
  console.table(items.rows);

  const dummyIds = items.rows
    .filter((r) => /^(all|any)\b/i.test(r.name))
    .map((r) => r.id);
  console.log("Dummy 'All *' item ids:", dummyIds);
  if (dummyIds.length === 0) return;

  const de = await pool.query(
    `
    select mli.name, count(*)::int as data_entry_rows,
           count(distinct de.input_def_id)::int as distinct_inputs,
           count(distinct de.report_period_id)::int as distinct_periods
    from data_entries de
    join managed_list_items mli on mli.id = de.energy_source_id
    where de.energy_source_id = any($1::int[])
    group by mli.name
    union all
    select 'via energy_provider_id: ' || mli.name, count(*)::int, count(distinct de.input_def_id)::int, count(distinct de.report_period_id)::int
    from data_entries de
    join managed_list_items mli on mli.id = de.energy_provider_id
    where de.energy_provider_id = any($1::int[])
    group by mli.name
  `,
    [dummyIds],
  );
  console.log("data_entries tagged with dummy values:");
  console.table(de.rows);

  const kpiRefs = await pool.query(
    `
    select k.id, k.name, fi.value as binding
    from kpi_definitions k, jsonb_array_elements(k.formula_inputs::jsonb) fi
    where (fi.value->>'energy_provider_id')::numeric = any($1::int[])
       or (fi.value->>'energy_type_id')::numeric = any($1::int[])
       or (fi.value->>'energy_source_id')::numeric = any($1::int[])
  `,
    [dummyIds],
  );
  console.log(`kpi formula bindings referencing dummies: ${kpiRefs.rowCount}`);
  console.table(kpiRefs.rows.slice(0, 15));

  // energy_resources (generators) can also carry an energy_source reference
  const er = await pool.query(
    `select column_name from information_schema.columns
     where table_name = 'energy_resources'`,
  );
  console.log(
    "energy_resources columns:",
    er.rows.map((r) => r.column_name).join(", "),
  );
  const srcCol = er.rows.find((r) => /energy_source/.test(r.column_name));
  if (srcCol) {
    const erRefs = await pool.query(
      `select mli.name, count(*)::int as generators
       from energy_resources e
       join managed_list_items mli on mli.id = e.${srcCol.column_name}
       where e.${srcCol.column_name} = any($1::int[])
       group by mli.name`,
      [dummyIds],
    );
    console.log("energy_resources (generators) using dummy sources:");
    console.table(erRefs.rows);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
