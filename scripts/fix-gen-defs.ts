import { db } from "@/db/connection";
import { measureDefinitions, inputDlDefMappings } from "@/db/schema/dataEntry";
import { sql, eq, and, inArray } from "drizzle-orm";

async function main() {
  // OBSOLETE: measure_definitions.is_aggregated was retired 2026-08-31 (dup of is_calculated).
  // This script's whole purpose was setting that now-dropped column — abort so a stray run fails safely.
  console.error("fix-gen-defs.ts is obsolete: measure_definitions.is_aggregated was retired. Aborting.");
  process.exit(1);
  // Get IDs of defs with mappings created by our bulk script (mappings created recently)
  // Actually, just get defs that were NOT originally in prism (identified by subcat 273 "generation" and sort_order=0 since bulk-created ones have defaults)

  // Simplest approach: get all gen def IDs, check which ones have mappings that were mapped from training,
  // then mark those where the mapping came from our bulk script.

  // We know original gen defs had IDs around 13, 1651, 1652, etc. New gen defs have IDs from the bulk insert.
  // Since all 648 defs have IDs <= 1910, I can't use an ID range.

  // Let me use a different approach: mark all defs with mapping confidence='auto' as is_aggregated=true
  // These are the ones created by our bulk script

  const autoMappedDefs = await db
    .selectDistinct({ id: inputDlDefMappings.measure_def_id })
    .from(inputDlDefMappings)
    .where(
      and(
        eq(inputDlDefMappings.confidence, "auto"),
        eq(inputDlDefMappings.is_auto, true),
      ),
    );

  const autoDefIds = autoMappedDefs.map((d) => d.id);
  console.log(`Auto-mapped defs (confidence=auto): ${autoDefIds.length}`);

  if (autoDefIds.length === 0) {
    console.log("No auto-mapped defs found. Checking recently created defs...");
    // Fallback: get defs where sort_order=0 and subcategory=273 and name contains "GEN" or "IPP"
    const bulkDefs = await db
      .select({ id: measureDefinitions.id, name: measureDefinitions.name })
      .from(measureDefinitions)
      .where(
        and(
          eq(measureDefinitions.measures_subgroup_id, 273),
          eq(measureDefinitions.sort_order, 0),
        ),
      );
    console.log(`Defs with sort_order=0, subcat=273: ${bulkDefs.length}`);
    process.exit(0);
  }

  // Mark them as aggregated
  await db
    .update(measureDefinitions)
    .set({ is_aggregated: true })
    .where(inArray(measureDefinitions.id, autoDefIds));
  console.log(`Marked ${autoDefIds.length} defs as is_aggregated=true`);

  // Verify
  const activeNonAgg = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_aggregated, false),
        eq(measureDefinitions.is_system_generated, false),
      ),
    );
  console.log(
    `Active, non-aggregated, non-system defs: ${activeNonAgg[0].cnt}`,
  );

  const activeNonAggGen = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_aggregated, false),
        eq(measureDefinitions.is_system_generated, false),
        eq(measureDefinitions.measures_subgroup_id, 273),
      ),
    );
  console.log(`  Of which generation (subcat 273): ${activeNonAggGen[0].cnt}`);

  process.exit(0);
}
main().catch(console.error);
