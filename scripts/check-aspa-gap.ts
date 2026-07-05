import { db } from "@/db/connection";
import { dataEntries, inputDefinitions } from "@/db/schema/dataEntry";
import { energyResources, serviceAreas } from "@/db/schema/utility";
import { sql, eq, and } from "drizzle-orm";

async function main() {
  const rpId = 169;
  const utilId = 2; // ASPA

  const genIds = new Set((await db.select({ id: inputDefinitions.id }).from(inputDefinitions).where(and(eq(inputDefinitions.is_active, true), eq(inputDefinitions.subcategory_id, 273)))).map(d => d.id));
  const defRows = (await db.select({ id: inputDefinitions.id, subcat: inputDefinitions.subcategory_id }).from(inputDefinitions).where(and(eq(inputDefinitions.is_active, true), eq(inputDefinitions.is_system_generated, false)))).map(d => d.id);
  const defSet = new Set(defRows);

  const activeErs = (await db.select({ id: energyResources.id, utility_id: energyResources.utility_id, period_entries: energyResources.period_entries }).from(energyResources).where(eq(energyResources.is_virtual, false)));
  const activeErIds = new Set(activeErs.filter(er => {
    if (er.utility_id !== utilId) return false;
    return ((er.period_entries as any[]) ?? []).some((p: any) => p.report_period_id === rpId && p.is_active);
  }).map(e => e.id));

  const saIds = new Set((await db.select({ id: serviceAreas.id }).from(serviceAreas).where(and(eq(serviceAreas.is_active, true), eq(serviceAreas.is_virtual, false), eq(serviceAreas.utility_id, utilId)))).map(s => s.id));

  const entries = await db.select().from(dataEntries).where(and(eq(dataEntries.report_period_id, rpId), eq(dataEntries.is_deleted, false), eq(dataEntries.is_relevant, true)));

  let gap1 = 0, gap2 = 0, gap3 = 0;
  for (const e of entries) {
    if (genIds.has(e.input_def_id)) {
      // Gen entry
      if (e.energy_resource_id && !activeErIds.has(e.energy_resource_id)) {
        gap1++;
        if (gap1 <= 3) console.log(`  Gap: gen def=${e.input_def_id} ER=${e.energy_resource_id} (ER not active for this period)`);
      }
    } else {
      // Non-gen entry
      if (!defSet.has(e.input_def_id)) {
        gap2++;
        if (gap2 <= 3) console.log(`  Gap: non-gen def=${e.input_def_id} (def not in definitionRows)`);
      }
      if (e.service_area_id && !saIds.has(e.service_area_id)) {
        gap3++;
        if (gap3 <= 3) console.log(`  Gap: non-gen def=${e.input_def_id} SA=${e.service_area_id} (SA not in utility SA list)`);
      }
    }
  }

  console.log(`\nRP 169 ASPA gap analysis:`);
  console.log(`  Gen entries with ER not active: ${gap1}`);
  console.log(`  Non-gen defs not in definitionRows: ${gap2}`);
  console.log(`  Non-gen SAs not in utility SA list: ${gap3}`);
  console.log(`  Total gap contributions: ${gap1 + gap2 + gap3}`);

  process.exit(0);
}
main().catch(console.error);
