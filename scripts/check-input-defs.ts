import { db } from "@/db/connection";
import { inputDefinitions } from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { sql, eq, and } from "drizzle-orm";

async function main() {
  // Get managed list names for context
  const mlNames = new Map<number, string>();
  const items = await db.select({ id: managedListItems.id, name: managedListItems.name, listId: managedListItems.list_id }).from(managedListItems);
  for (const i of items) {
    mlNames.set(i.id, i.name);
    mlNames.set(i.listId, `LIST_${i.listId}`);
  }

  // Show existing gen-related input defs
  const genDefs = await db
    .select({
      id: inputDefinitions.id,
      name: inputDefinitions.name,
      cat: inputDefinitions.category_id,
      subcat: inputDefinitions.subcategory_id,
      unit: inputDefinitions.unit_id,
      dtype: inputDefinitions.data_type_id,
      vn: inputDefinitions.variable_name,
    })
    .from(inputDefinitions)
    .where(sql`${inputDefinitions.name} ILIKE '%gen%' OR ${inputDefinitions.name} ILIKE '%installed%' OR ${inputDefinitions.name} ILIKE '%capacity%'`);
  console.log("Existing gen-related input defs:");
  for (const d of genDefs) {
    console.log(`  ${d.id}: ${d.name} (vn:${d.vn}) cat:${d.cat}(${mlNames.get(d.cat)??'?'}) subcat:${d.subcat}(${mlNames.get(d.subcat)??'?'}) unit:${d.unit}(${mlNames.get(d.unit)??'?'}) dtype:${d.dtype}(${mlNames.get(d.dtype)??'?'})`);
  }

  // Show total distribution
  const allDefs = await db
    .select({ cat: inputDefinitions.category_id, cnt: sql<number>`count(*)` })
    .from(inputDefinitions)
    .groupBy(inputDefinitions.category_id);
  console.log("\nCategory distribution:");
  for (const d of allDefs) {
    console.log(`  cat ${d.cat} (${mlNames.get(d.cat) ?? '?'}): ${d.cnt}`);
  }

  const allSubcats = await db
    .select({ subcat: inputDefinitions.subcategory_id, cnt: sql<number>`count(*)` })
    .from(inputDefinitions)
    .groupBy(inputDefinitions.subcategory_id);
  console.log("\nSubcategory distribution:");
  for (const d of allSubcats) {
    console.log(`  subcat ${d.subcat} (${mlNames.get(d.subcat) ?? '?'}): ${d.cnt}`);
  }

  // Show unit distribution
  const unitDist = await db
    .select({ unit: inputDefinitions.unit_id, cnt: sql<number>`count(*)` })
    .from(inputDefinitions)
    .groupBy(inputDefinitions.unit_id);
  console.log("\nUnit distribution:");
  for (const d of unitDist) {
    console.log(`  unit ${d.unit} (${mlNames.get(d.unit) ?? '?'}): ${d.cnt}`);
  }

  // Show data type distribution
  const dtypeDist = await db
    .select({ dtype: inputDefinitions.data_type_id, cnt: sql<number>`count(*)` })
    .from(inputDefinitions)
    .groupBy(inputDefinitions.data_type_id);
  console.log("\nData type distribution:");
  for (const d of dtypeDist) {
    console.log(`  dtype ${d.dtype} (${mlNames.get(d.dtype) ?? '?'}): ${d.cnt}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
