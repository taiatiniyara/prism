import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { energyResources } from "@/db/schema/utility";
import { sql, eq, and, inArray } from "drizzle-orm";

async function main() {
  const rpId = 169; // ASPA 2022
  
  // Get gen def IDs
  const genIds = (await db
    .select({ id: inputDefinitions.id })
    .from(inputDefinitions)
    .where(and(eq(inputDefinitions.is_active, true), eq(inputDefinitions.subcategory_id, 273)))
  ).map(d => d.id);

  // Get entries for this period that are gen defs
  const entries = await db
    .select({
      inputDefId: dataEntries.input_def_id,
      energyResourceId: dataEntries.energy_resource_id,
      statusId: dataEntries.status_id,
    })
    .from(dataEntries)
    .where(and(
      eq(dataEntries.report_period_id, rpId),
      eq(dataEntries.is_deleted, false),
      eq(dataEntries.is_relevant, true),
      inArray(dataEntries.input_def_id, genIds.length > 0 ? genIds : [-1]),
    ));
  console.log(`Gen entries for RP ${rpId}: ${entries.length}`);

  // Count unique (inputDef, ER) combos
  const combos = new Set(entries.map(e => `${e.inputDefId}:${e.energyResourceId}`));
  console.log(`Unique (gen def, ER) combos: ${combos.size}`);

  // Entries WITHOUT energy_resource_id
  const noEr = entries.filter(e => e.energyResourceId == null);
  console.log(`Gen entries without ER FK: ${noEr.length}`);
  for (const e of noEr.slice(0, 5)) {
    console.log(`  def=${e.inputDefId} er=null status=${e.statusId}`);
  }

  // Count non-gen entries too
  const nonGenEntries = await db
    .select({
      inputDefId: dataEntries.input_def_id,
      serviceAreaId: dataEntries.service_area_id,
      statusId: dataEntries.status_id,
    })
    .from(dataEntries)
    .where(and(
      eq(dataEntries.report_period_id, rpId),
      eq(dataEntries.is_deleted, false),
      eq(dataEntries.is_relevant, true),
    ));

  // Split by gen/non-gen
  const nonGenGenIds = nonGenEntries.filter(e => genIds.includes(e.inputDefId));
  const nonGenNonGenIds = nonGenEntries.filter(e => !genIds.includes(e.inputDefId));
  console.log(`\nTotal entries (relevant): ${nonGenEntries.length}`);
  console.log(`  Gen entries: ${nonGenGenIds.length}`);
  console.log(`  Non-gen entries: ${nonGenNonGenIds.length}`);

  // Check for 'orphan' entries where input def doesn't exist as active
  const allActiveIds = new Set((await db
    .select({ id: inputDefinitions.id })
    .from(inputDefinitions)
    .where(eq(inputDefinitions.is_active, true))
  ).map(d => d.id));

  const orphanEntries = nonGenEntries.filter(e => !allActiveIds.has(e.inputDefId));
  console.log(`\nEntries with inactive/missing input defs: ${orphanEntries.length}`);
  for (const e of orphanEntries.slice(0, 5)) {
    console.log(`  def=${e.inputDefId} sa=${e.serviceAreaId} status=${e.statusId}`);
  }

  // Status breakdown
  const byStatus = nonGenEntries.reduce((acc, e) => {
    acc[e.statusId] = (acc[e.statusId] ?? 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  console.log(`\nStatus breakdown for RP ${rpId} (all relevant entries):`);
  for (const [s, c] of Object.entries(byStatus)) {
    const labels: Record<string,string> = {"1":"Req","2":"Pend","3":"Ent","4":"Rev","5":"App","6":"End","7":"NA"};
    console.log(`  ${labels[s]??s}: ${c}`);
  }

  process.exit(0);
}
main().catch(console.error);
