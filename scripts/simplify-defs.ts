import { db } from "@/db/connection";
import { inputDefinitions, inputDlDefMappings } from "@/db/schema/dataEntry";
import { eq, and, inArray, sql } from "drizzle-orm";

async function main() {
  const autoIds = (await db
    .selectDistinct({ defId: inputDlDefMappings.input_def_id })
    .from(inputDlDefMappings)
    .where(and(eq(inputDlDefMappings.confidence, "auto"), eq(inputDlDefMappings.is_auto, true)))
  ).map(m => m.defId);

  // Deactivate all remaining auto-created defs
  if (autoIds.length > 0) {
    await db.update(inputDefinitions)
      .set({ is_active: false })
      .where(inArray(inputDefinitions.id, autoIds));
    console.log(`Deactivated ${autoIds.length} auto-created defs`);
  }

  const active = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(inputDefinitions)
    .where(eq(inputDefinitions.is_active, true));
  console.log(`Active defs: ${active[0].cnt}`);

  const activeNonSys = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(inputDefinitions)
    .where(and(eq(inputDefinitions.is_active, true), eq(inputDefinitions.is_system_generated, false)));
  console.log(`Active non-system: ${activeNonSys[0].cnt}`);

  process.exit(0);
}
main().catch(console.error);
