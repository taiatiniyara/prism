/**
 * measure_definitions / measure_dimension_scope schema finalisation (2026-07-09):
 *   1. valid_range_min/max: integer -> numeric (ratio-stored % measures need ranges like 0–1,
 *      per the decided %-storage convention).
 *   2. measure_dimension_scope: is_applicable (boolean) -> expansion_mode varchar
 *      (not_applicable / all_members / by_context) — Fixed/Contextual is a per
 *      measure–dimension property; the measure-level label is computed.
 *   3. Drops measure_definitions.measure_type_id (briefly added, superseded same day by
 *      expansion_mode).
 * Idempotent; MUST also be run against prod.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

async function main() {
  await db.execute(sql`
    ALTER TABLE measure_dimension_scope ADD COLUMN IF NOT EXISTS expansion_mode varchar(16)`);
  await db.execute(sql`
    UPDATE measure_dimension_scope SET expansion_mode =
      CASE WHEN is_applicable THEN 'by_context' ELSE 'not_applicable' END
    WHERE expansion_mode IS NULL AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'measure_dimension_scope' AND column_name = 'is_applicable')`).catch(() => undefined);
  await db.execute(sql`ALTER TABLE measure_dimension_scope DROP COLUMN IF EXISTS is_applicable`);
  console.log("measure_dimension_scope: expansion_mode ensured, is_applicable dropped");

  await db.execute(sql`ALTER TABLE measure_definitions DROP COLUMN IF EXISTS measure_type_id`);
  console.log("measure_type_id: ensured dropped");

  const types = await db.execute(sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'measure_definitions' AND column_name IN ('valid_range_min','valid_range_max')`);
  for (const c of (types.rows ?? types) as { column_name: string; data_type: string }[]) {
    if (c.data_type === "numeric") {
      console.log(`${c.column_name}: already numeric — skip`);
    } else {
      await db.execute(sql.raw(
        `ALTER TABLE measure_definitions ALTER COLUMN ${c.column_name} TYPE numeric USING ${c.column_name}::numeric`,
      ));
      console.log(`${c.column_name}: ${c.data_type} -> numeric`);
    }
  }

  const verify = await db.execute(sql`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_name = 'measure_definitions'
      AND column_name IN ('measure_type_id','valid_range_min','valid_range_max')
    ORDER BY column_name`);
  console.log("VERIFY:", JSON.stringify(verify.rows ?? verify));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
