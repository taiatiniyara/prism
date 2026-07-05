import { db } from "@/db/connection";
import { inputDefinitions, inputDlDefMappings } from "@/db/schema/dataEntry";
import { sql, eq, and, inArray } from "drizzle-orm";

async function main() {
  const autoMappedDefs = await db
    .selectDistinct({ id: inputDlDefMappings.input_def_id })
    .from(inputDlDefMappings)
    .where(and(
      eq(inputDlDefMappings.confidence, "auto"),
      eq(inputDlDefMappings.is_auto, true),
    ));
  const ids = autoMappedDefs.map(d => d.id);

  if (ids.length > 0) {
    await db.update(inputDefinitions)
      .set({ is_aggregated: false })
      .where(inArray(inputDefinitions.id, ids));
    console.log(`Reverted ${ids.length} defs to is_aggregated=false`);
  }

  const active = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(inputDefinitions)
    .where(and(
      eq(inputDefinitions.is_active, true),
      eq(inputDefinitions.is_system_generated, false),
    ));
  console.log(`Active non-system defs: ${active[0].cnt}`);

  process.exit(0);
}
main().catch(console.error);
