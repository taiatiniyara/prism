/**
 * Read-only inspection of input + KPI definitions to understand the question
 * surface area. Run with: npx tsx scripts/inspect-definitions.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";

import { db } from "@/db/connection";

const print = (title: string, rows: unknown) => {
  console.log("\n=== " + title + " ===");
  console.log(JSON.stringify(rows, null, 2));
};

const main = async () => {
  // --- 1. Counts by type ----------------------------------------------------
  const counts = await db.execute(sql`
    select
      count(*) filter (where is_kpi = true and is_active = true) as active_kpis,
      count(*) filter (where is_kpi = false and is_active = true) as active_inputs,
      count(*) filter (where is_calculated = true and is_active = true) as calculated,
      count(*) filter (where is_aggregated = true and is_active = true) as aggregated,
      count(*) filter (where is_descriptive = true and is_active = true) as descriptive,
      count(*) filter (where is_currency = true and is_active = true) as currency,
      count(*) filter (where is_kpi_input = true and is_active = true) as kpi_inputs,
      count(*) filter (where is_active = true) as total_active,
      count(*) as total_all
    from input_definitions
  `);
  print("Definition counts", counts.rows);

  // --- 2. Active categories with counts -------------------------------------
  const categories = await db.execute(sql`
    select c.id, c.name as category, count(*) as definition_count,
           count(*) filter (where idf.is_kpi) as kpi_count,
           count(*) filter (where not idf.is_kpi) as input_count
    from input_definitions idf
    join managed_list_items c on c.id = idf.category_id
    where idf.is_active = true
    group by c.id, c.name
    order by definition_count desc
  `);
  print("Categories", categories.rows);

  // --- 3. Active subcategories with counts ----------------------------------
  const subcategories = await db.execute(sql`
    select s.id, s.name as subcategory, parent.name as category,
           count(*) as definition_count,
           count(*) filter (where idf.is_kpi) as kpi_count
    from input_definitions idf
    join managed_list_items s on s.id = idf.subcategory_id
    left join managed_list_items parent on parent.id = s.parent_id
    where idf.is_active = true
    group by s.id, s.name, parent.name
    order by definition_count desc
  `);
  print("Subcategories", subcategories.rows);

  // --- 4. Sample of active KPI definitions ----------------------------------
  const kpis = await db.execute(sql`
    select idf.id, idf.name, idf.variable_name,
           c.name as category, s.name as subcategory,
           u.name as unit, dt.name as data_type, ag.name as agg_level,
           idf.is_calculated, idf.is_aggregated, idf.formula is not null as has_formula
    from input_definitions idf
    left join managed_list_items c on c.id = idf.category_id
    left join managed_list_items s on s.id = idf.subcategory_id
    left join managed_list_items u on u.id = idf.unit_id
    left join managed_list_items dt on dt.id = idf.data_type_id
    left join managed_list_items ag on ag.id = idf.agg_level_id
    where idf.is_active = true and idf.is_kpi = true
    order by c.name, idf.name
    limit 200
  `);
  print(`KPI definitions (showing ${kpis.rows.length})`, kpis.rows);

  // --- 5. Sample of active input definitions --------------------------------
  const inputs = await db.execute(sql`
    select idf.id, idf.name, idf.variable_name,
           c.name as category, s.name as subcategory,
           u.name as unit, dt.name as data_type,
           idf.is_descriptive, idf.is_currency, idf.is_kpi_input
    from input_definitions idf
    left join managed_list_items c on c.id = idf.category_id
    left join managed_list_items s on s.id = idf.subcategory_id
    left join managed_list_items u on u.id = idf.unit_id
    left join managed_list_items dt on dt.id = idf.data_type_id
    where idf.is_active = true and idf.is_kpi = false
    order by c.name, idf.name
    limit 200
  `);
  print(`Input definitions (showing ${inputs.rows.length})`, inputs.rows);

  // --- 6. Managed lists used as dimensions (sample values) ------------------
  const dimensionLists = await db.execute(sql`
    select ml.name as list_name, count(mli.*) as item_count,
           string_agg(distinct mli.name, ', ' order by mli.name) filter (where mli.is_active) as sample_items
    from managed_lists ml
    left join managed_list_items mli on mli.list_id = ml.id
    where ml.name in (
      'Energy Source','Energy Provider','Energy Type','Customer Type',
      'Payment Mode','Aggregation Level','KPI Category','Input Category',
      'Subcategory','Unit','Data Type','Service Group','Utility Service'
    )
    group by ml.id, ml.name
    order by ml.name
  `);
  print("Dimension managed lists", dimensionLists.rows);

  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
