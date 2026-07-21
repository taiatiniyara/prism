import { db } from "@/db/connection";
import { measureDefinitions, inputDlDefMappings } from "@/db/schema/dataEntry";
import { eq, and, sql } from "drizzle-orm";

async function main() {
  // Find auto-created defs: those with is_auto=true mapping that don't exist as originals
  // All auto-mapped defs
  const autoMapped = await db
    .select({
      defId: inputDlDefMappings.measure_def_id,
      trainingId: inputDlDefMappings.training_dl_def_id,
      trainingName: inputDlDefMappings.training_dl_name,
    })
    .from(inputDlDefMappings)
    .where(
      and(
        eq(inputDlDefMappings.confidence, "auto"),
        eq(inputDlDefMappings.is_auto, true),
      ),
    );

  // For each auto-mapped def, check if it's the only mapping to that def
  // If a def was just matched (not created), it would have a direct name match
  // Created defs are ones where training_dl_name == the prism def name

  const newDefs: Array<{
    defId: number;
    trainingId: number;
    trainingName: string;
  }> = [];

  for (const m of autoMapped) {
    const def = await db
      .select({
        id: measureDefinitions.id,
        name: measureDefinitions.name,
        sort_order: measureDefinitions.sort_order,
      })
      .from(measureDefinitions)
      .where(eq(measureDefinitions.id, m.defId))
      .limit(1);

    if (!def[0]) continue;

    // Auto-created defs have sort_order=0 and name matches training name exactly
    const prismName = (def[0].name ?? "").trim().toLowerCase();
    const trainingName = (m.trainingName ?? "").trim().toLowerCase();

    if (prismName === trainingName) {
      newDefs.push({
        defId: m.defId,
        trainingId: m.trainingId,
        trainingName: m.trainingName,
      });
    }
  }

  console.log(`Auto-created defs (new, not matched): ${newDefs.length}`);
  for (const d of newDefs) {
    console.log(
      `  prism:${d.defId} ← training:${d.trainingId} "${d.trainingName}"`,
    );
  }

  // Count data entries referencing these defs
  if (newDefs.length > 0) {
    const ids = newDefs.map((d) => d.defId);
    const entryCount = await db.execute(sql`
      SELECT count(*) FROM data_entries WHERE measure_def_id IN (${sql.join(ids.map(String), sql`,`)}) AND is_deleted = false
    `);
    console.log(
      `\nData entries referencing these defs: ${(entryCount as any).rows[0].count}`,
    );

    // Show alternatives — existing defs that might be similar
    for (const d of newDefs) {
      console.log(`\n--- ${d.trainingName} ---`);
      // Search for similar names in existing defs
      const similar = await db.execute(sql`
        SELECT id, name FROM measure_definitions  
        WHERE id NOT IN (${sql.join(ids.map(String), sql`,`)}) 
        AND is_active = true
        ORDER BY id LIMIT 50
      `);
      // Just show a note
      console.log(`  Need to remap to an existing def manually.`);
    }
  }

  process.exit(0);
}
main().catch(console.error);
