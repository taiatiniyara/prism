import { db } from "@/db/connection";
import { energyResources } from "@/db/schema/utility";
import { sql } from "drizzle-orm";

async function main() {
  // Check two ERs from util 16
  const er1 = await db.select({ id: energyResources.id, name: energyResources.name, period_entries: energyResources.period_entries }).from(energyResources).where(sql`id = 88`).limit(1);
  const _er2 = await db.select({ id: energyResources.id, name: energyResources.name, period_entries: energyResources.period_entries }).from(energyResources).where(sql`id = 255`).limit(1);
  
  if (er1[0]) {
    const pe1 = er1[0].period_entries as unknown[];
    console.log(`ER ${er1[0].id} (${er1[0].name}): ${pe1.length} entries`);
    console.log("  First 3:", JSON.stringify(pe1.slice(0, 3)));
    console.log("  Last 3:", JSON.stringify(pe1.slice(-3)));
  }

  // Check if all util 16 ERs have the same period_entries
  const util16Ers = await db.select({ id: energyResources.id, name: energyResources.name, period_entries: energyResources.period_entries }).from(energyResources).where(sql`utility_id = 16 AND jsonb_array_length(period_entries) > 50`).limit(3);
  for (const er of util16Ers) {
    const pe = er.period_entries as Array<{ report_period_id?: number; utility_report_period_id?: number; is_active?: boolean }>;
    const activeCount = pe.filter((e) => e.is_active).length;
    const uniqueRpIds = new Set(pe.map((e) => e.report_period_id ?? e.utility_report_period_id));
    console.log(`\nER ${er.id} (${er.name}): ${pe.length} entries, ${activeCount} active, ${uniqueRpIds.size} unique RPs`);
  }

  // Check: total report periods for Nauru
  const rpCount = await db.execute(sql`SELECT count(*) FROM report_periods WHERE utility_id = 16`);
  console.log(`\nTotal report periods for Nauru: ${(rpCount as unknown as { rows: Array<{ count: number }> }).rows[0].count}`);

  process.exit(0);
}
main().catch(console.error);
