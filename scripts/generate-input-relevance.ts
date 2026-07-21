import { db } from "@/db/connection";
import {
  inputRelevance,
  measureDefinitions,
} from "@/db/schema/dataEntry";
import { sql, eq, and } from "drizzle-orm";

async function main() {
  console.log("=== Auto-generate Input Relevance ===\n");

  // 1. Delete existing input_relevance (only 9 rows, all manual)
  await db.delete(inputRelevance);
  console.log("Cleared existing input_relevance");

  // 2. For each generation input def, find which energy_source_ids have actual data entries
  const genDefs = await db
    .select({ id: measureDefinitions.id, name: measureDefinitions.name })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.subcategory_id, 273),
      ),
    );
  console.log(`Generation defs: ${genDefs.length}`);

  // 3. Get all unique (input_def, energy_source) combos from data_entries where ER FK is set
  const actualCombos = await db.execute(sql`
    SELECT DISTINCT de.measure_def_id, er.energy_source_id
    FROM data_entries de
    JOIN energy_resources er ON de.energy_resource_id = er.id
    WHERE de.is_deleted = false AND de.is_relevant = true
      AND de.energy_resource_id IS NOT NULL
  `);
  const combos = (
    actualCombos as unknown as { rows: Array<{ measure_def_id: number; energy_source_id: number }> }
  ).rows;
  console.log(
    `Actual (input_def, energy_source) combos with data: ${combos.length}`,
  );

  const comboSet = new Set(
    combos.map((c) => `${c.measure_def_id}:${c.energy_source_id}`),
  );

  // 4. For each gen def, find which energy_source_ids exist in the system
  // Get ALL distinct energy_source_ids from energy_resources (not just from data entries)
  const esResults = await db.execute(sql`
    SELECT DISTINCT energy_source_id FROM energy_resources
  `);
  const esIds = (
    esResults as unknown as { rows: Array<{ energy_source_id: number }> }
  ).rows.map((r) => r.energy_source_id);
  console.log(`Unique energy_source_ids in all ERs: ${esIds.length}`);

  // 5. For each generation def, mark as relevant (is_relevant=false means counted as NOT relevant = EXCLUDED from Requested)
  //    Combos WITH data → is_relevant=true (default) → counted in Requested
  //    Combos WITHOUT data → is_relevant=false → EXCLUDED from Requested
  //    Since default is is_relevant=true, we only need to mark the ones WITHOUT data as is_relevant=false

  let inserted = 0;
  const values: string[] = [];
  for (const def of genDefs) {
    for (const esId of esIds) {
      const key = `${def.id}:${esId}`;
      if (comboSet.has(key)) continue;
      values.push(`(${def.id},${esId},false)`);
    }
    if (values.length >= 500) {
      await db.execute(
        sql.raw(
          `INSERT INTO input_relevance (measure_def_id, dimension_id, is_relevant) VALUES ${values.join(",")}`,
        ),
      );
      inserted += values.length;
      values.length = 0;
      console.log(`  Inserted ${inserted}...`);
    }
  }
  if (values.length > 0) {
    await db.execute(
      sql.raw(
        `INSERT INTO input_relevance (measure_def_id, dimension_id, is_relevant) VALUES ${values.join(",")}`,
      ),
    );
    inserted += values.length;
  }

  console.log(`Inserted ${inserted} irrelevant input_relevance rows`);
  console.log(
    `\nNow verify: for each gen def, only combos with actual data count in Requested.`,
  );

  process.exit(0);
}
main().catch(console.error);
