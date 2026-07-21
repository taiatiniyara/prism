import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { sql, eq, and } from "drizzle-orm";

async function main() {
  // Get managed list names for context
  const mlNames = new Map<number, string>();
  const items = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
      listId: managedListItems.list_id,
    })
    .from(managedListItems);
  for (const i of items) {
    mlNames.set(i.id, i.name);
    mlNames.set(i.listId, `LIST_${i.listId}`);
  }

  // Show existing gen-related input defs
  const genDefs = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      cat: measureDefinitions.category_id,
      subcat: measureDefinitions.subcategory_id,
      unit: measureDefinitions.unit_id,
      dtype: measureDefinitions.data_type_id,
      vn: measureDefinitions.variable_name,
    })
    .from(measureDefinitions)
    .where(
      sql`${measureDefinitions.name} ILIKE '%gen%' OR ${measureDefinitions.name} ILIKE '%installed%' OR ${measureDefinitions.name} ILIKE '%capacity%'`,
    );
  console.log("Existing gen-related input defs:");
  for (const d of genDefs) {
    console.log(
      `  ${d.id}: ${d.name} (vn:${d.vn}) cat:${d.cat}(${mlNames.get(d.cat) ?? "?"}) subcat:${d.subcat}(${mlNames.get(d.subcat) ?? "?"}) unit:${d.unit}(${mlNames.get(d.unit) ?? "?"}) dtype:${d.dtype}(${mlNames.get(d.dtype) ?? "?"})`,
    );
  }

  // Show total distribution
  const allDefs = await db
    .select({ cat: measureDefinitions.category_id, cnt: sql<number>`count(*)` })
    .from(measureDefinitions)
    .groupBy(measureDefinitions.category_id);
  console.log("\nCategory distribution:");
  for (const d of allDefs) {
    console.log(`  cat ${d.cat} (${mlNames.get(d.cat) ?? "?"}): ${d.cnt}`);
  }

  const allSubcats = await db
    .select({
      subcat: measureDefinitions.subcategory_id,
      cnt: sql<number>`count(*)`,
    })
    .from(measureDefinitions)
    .groupBy(measureDefinitions.subcategory_id);
  console.log("\nSubcategory distribution:");
  for (const d of allSubcats) {
    console.log(
      `  subcat ${d.subcat} (${mlNames.get(d.subcat) ?? "?"}): ${d.cnt}`,
    );
  }

  // Show unit distribution
  const unitDist = await db
    .select({ unit: measureDefinitions.unit_id, cnt: sql<number>`count(*)` })
    .from(measureDefinitions)
    .groupBy(measureDefinitions.unit_id);
  console.log("\nUnit distribution:");
  for (const d of unitDist) {
    console.log(`  unit ${d.unit} (${mlNames.get(d.unit) ?? "?"}): ${d.cnt}`);
  }

  // Show data type distribution
  const dtypeDist = await db
    .select({
      dtype: measureDefinitions.data_type_id,
      cnt: sql<number>`count(*)`,
    })
    .from(measureDefinitions)
    .groupBy(measureDefinitions.data_type_id);
  console.log("\nData type distribution:");
  for (const d of dtypeDist) {
    console.log(
      `  dtype ${d.dtype} (${mlNames.get(d.dtype) ?? "?"}): ${d.cnt}`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
