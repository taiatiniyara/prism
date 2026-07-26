import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { eq, sql, and } from "drizzle-orm";

async function main() {
  // Check subcategory distribution
  const bySubcat = await db
    .select({
      subcat: measureDefinitions.measures_subgroup_id,
      cnt: sql<number>`count(*)`,
    })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true))
    .groupBy(measureDefinitions.measures_subgroup_id);

  console.log("Active defs by subcategory:");
  for (const s of bySubcat) {
    console.log(`  subcat ${s.subcat}: ${s.cnt}`);
  }

  // Mark inactive all defs with no data entries
  const result = await db.execute(sql`
    UPDATE measure_definitions  SET is_active = false
    WHERE is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM data_entries de 
      WHERE de.measure_def_id = measure_definitions .id AND de.is_deleted = false
    )
  `);
  console.log(`\nDeactivated ${(result as unknown as { rowCount: number }).rowCount} defs with no data`);

  // Verify
  const activeNow = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true));
  console.log(`Active now: ${activeNow[0].cnt}`);

  // Check defs with data but in generation subcat 273
  const genWithData = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.measures_subgroup_id, 273),
      ),
    );
  console.log(`Active generation (subcat 273) defs: ${genWithData[0].cnt}`);

  process.exit(0);
}
main().catch(console.error);
