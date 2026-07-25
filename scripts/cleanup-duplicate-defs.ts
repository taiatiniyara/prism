import { db } from "@/db/connection";
import {
  measureDefinitions,
  inputDlDefMappings,
  dataEntries,
} from "@/db/schema/dataEntry";
import { eq, and, inArray, sql, notInArray } from "drizzle-orm";

async function main() {
  console.log("=== Clean Up Duplicate Input Definitions ===\n");

  // Get auto-mapped def IDs (these are the ones we created)
  const autoMapped = await db
    .selectDistinct({ defId: inputDlDefMappings.measure_def_id })
    .from(inputDlDefMappings)
    .where(
      and(
        eq(inputDlDefMappings.confidence, "auto"),
        eq(inputDlDefMappings.is_auto, true),
      ),
    );
  const autoDefIds = new Set(autoMapped.map((m) => m.defId));
  console.log(`Auto-mapped def IDs: ${autoDefIds.size}`);

  // Get all input defs with their names
  const allDefs = await db
    .select({ id: measureDefinitions.id, name: measureDefinitions.name })
    .from(measureDefinitions)
    .orderBy(measureDefinitions.id);
  console.log(`Total defs: ${allDefs.length}`);

  // Find duplicates: for each auto-mapped def, check if there's an older def with the same name
  const duplicates = new Map<number, number>(); // duplicateId -> originalId
  const toDelete = new Set<number>();
  const toKeep = new Set<number>();

  for (const def of allDefs) {
    if (!autoDefIds.has(def.id)) {
      toKeep.add(def.id);
      continue;
    }
    // This is an auto-created def. Check if an original exists with the same name.
    const original = allDefs.find(
      (d) => d.name === def.name && !autoDefIds.has(d.id),
    );
    if (original) {
      duplicates.set(def.id, original.id);
      toDelete.add(def.id);
    } else {
      // No duplicate — this is a genuinely new def
      toKeep.add(def.id);
    }
  }

  console.log(`Duplicate defs to remove: ${duplicates.size}`);
  console.log(
    `Genuinely new defs to keep: ${toKeep.size - (allDefs.length - autoDefIds.size)}`,
  );

  // For each duplicate, remap the training DL def to the original prism def
  let remapped = 0;
  for (const [dupId, origId] of duplicates) {
    // Update data entries referencing the duplicate to use the original
    const entryCount = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(dataEntries)
      .where(eq(dataEntries.measure_def_id, dupId));

    if (entryCount[0].cnt > 0) {
      // Remap data entries
      await db
        .update(dataEntries)
        .set({ measure_def_id: origId })
        .where(eq(dataEntries.measure_def_id, dupId));
    }

    // Update mappings
    await db
      .update(inputDlDefMappings)
      .set({ measure_def_id: origId })
      .where(eq(inputDlDefMappings.measure_def_id, dupId));

    remapped++;
    if (remapped % 50 === 0)
      console.log(`  Remapped ${remapped}/${duplicates.size}...`);
  }

  console.log(`Remapped ${remapped} duplicate defs`);

  // Delete the duplicate input definitions
  if (duplicates.size > 0) {
    const dupIds = [...duplicates.keys()];
    await db.delete(inputDlDefMappings).where(
      and(
        inArray(inputDlDefMappings.measure_def_id, dupIds),
        // Only if NOT remapped to original (safety)
      ),
    );

    // Delete from measure_definitions
    await db
      .delete(measureDefinitions)
      .where(inArray(measureDefinitions.id, dupIds));

    console.log(`Deleted ${dupIds.length} duplicate defs`);
  }

  // Verify
  const remaining = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(measureDefinitions);
  console.log(`\nRemaining defs: ${remaining[0].cnt}`);

  // Check data integrity
  const orphanEntries = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(dataEntries)
    .where(
      notInArray(
        dataEntries.measure_def_id,
        (
          await db
            .select({ id: measureDefinitions.id })
            .from(measureDefinitions)
        ).map((d) => d.id),
      ),
    );
  console.log(`Orphan data entries (missing def): ${orphanEntries[0].cnt}`);

  process.exit(0);
}

main().catch(console.error);
