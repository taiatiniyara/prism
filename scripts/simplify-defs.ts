import { db } from "@/db/connection";
import { measureDefinitions, inputDlDefMappings } from "@/db/schema/dataEntry";
import { eq, and, inArray, sql } from "drizzle-orm";

async function main() {
  const autoIds = (
    await db
      .selectDistinct({ defId: inputDlDefMappings.measure_def_id })
      .from(inputDlDefMappings)
      .where(
        and(
          eq(inputDlDefMappings.confidence, "auto"),
          eq(inputDlDefMappings.is_auto, true),
        ),
      )
  ).map((m) => m.defId);

  // Deactivate all remaining auto-created defs
  if (autoIds.length > 0) {
    await db
      .update(measureDefinitions)
      .set({ is_active: false })
      .where(inArray(measureDefinitions.id, autoIds));
    console.log(`Deactivated ${autoIds.length} auto-created defs`);
  }

  const active = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true));
  console.log(`Active defs: ${active[0].cnt}`);

  const activeNonSys = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_system_generated, false),
      ),
    );
  console.log(`Active non-system: ${activeNonSys[0].cnt}`);

  process.exit(0);
}
main().catch(console.error);
