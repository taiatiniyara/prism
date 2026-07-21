import { db } from "@/db/connection";
import { measureDefinitions, inputDlDefMappings } from "@/db/schema/dataEntry";
import { sql, eq, and, inArray } from "drizzle-orm";

async function main() {
  const autoMappedDefs = await db
    .selectDistinct({ id: inputDlDefMappings.measure_def_id })
    .from(inputDlDefMappings)
    .where(
      and(
        eq(inputDlDefMappings.confidence, "auto"),
        eq(inputDlDefMappings.is_auto, true),
      ),
    );
  const ids = autoMappedDefs.map((d) => d.id);

  if (ids.length > 0) {
    await db
      .update(measureDefinitions)
      .set({ is_aggregated: false })
      .where(inArray(measureDefinitions.id, ids));
    console.log(`Reverted ${ids.length} defs to is_aggregated=false`);
  }

  const active = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_system_generated, false),
      ),
    );
  console.log(`Active non-system defs: ${active[0].cnt}`);

  process.exit(0);
}
main().catch(console.error);
