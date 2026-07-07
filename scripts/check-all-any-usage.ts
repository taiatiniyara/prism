// One-off read-only check: where are the "All"/"Any" managed-list entries
// (energy provider/source/type) referenced — data_entries, formula_inputs,
// or nowhere? Run: node --env-file=.env --import tsx scripts/check-all-any-usage.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const items = await pool.query(`
    select mli.id, mli.name as item_name, mli.parent_id, ml.name as list_name
    from managed_list_items mli
    join managed_lists ml on ml.id = mli.list_id
    where lower(mli.name) in ('all', 'any')
    order by ml.name, mli.name
  `);
  console.log("All/Any managed-list items:");
  console.table(items.rows);

  const ids = items.rows.map((r) => r.id);
  if (ids.length === 0) {
    console.log("No All/Any items found.");
    return;
  }

  const de = await pool.query(
    `
    select 'energy_provider_id' as col, count(*)::int as refs from data_entries where energy_provider_id = any($1::int[])
    union all
    select 'energy_source_id', count(*)::int from data_entries where energy_source_id = any($1::int[])
    union all
    select 'energy_resource_id', count(*)::int from data_entries where energy_resource_id = any($1::int[])
  `,
    [ids],
  );
  console.log("data_entries references:");
  console.table(de.rows);

  const kpiRefs = await pool.query(
    `
    select k.id, k.name, fi.value as binding
    from kpi_definitions k, jsonb_array_elements(k.formula_inputs::jsonb) fi
    where (fi.value->>'energy_provider_id')::numeric = any($1::int[])
       or (fi.value->>'energy_type_id')::numeric = any($1::int[])
       or (fi.value->>'energy_source_id')::numeric = any($1::int[])
  `,
    [ids],
  );
  console.log(`kpi_definitions formula_inputs referencing All/Any: ${kpiRefs.rowCount}`);
  console.table(kpiRefs.rows.slice(0, 20));

  const inputRefs = await pool.query(
    `
    select i.id, i.name, fi.value as binding
    from input_definitions i, jsonb_array_elements(i.formula_inputs::jsonb) fi
    where (fi.value->>'energy_provider_id')::numeric = any($1::int[])
       or (fi.value->>'energy_type_id')::numeric = any($1::int[])
       or (fi.value->>'energy_source_id')::numeric = any($1::int[])
  `,
    [ids],
  );
  console.log(`input_definitions formula_inputs referencing All/Any: ${inputRefs.rowCount}`);
  console.table(inputRefs.rows.slice(0, 20));

  // Do the All/Any source items have a parent (type)? Broken type derivation check.
  const parents = items.rows.filter((r) => r.parent_id != null);
  console.log(`All/Any items with a parent set: ${parents.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void pool.end());
