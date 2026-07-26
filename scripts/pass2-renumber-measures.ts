/**
 * Pass 2 — renumber measure ids into compact blocks. Ordered so no target is ever occupied
 * (Solar out to 360s → Network into freed 340s → Equipment into 332/333). Per move:
 * insert a copy at the new id, repoint every FK child, delete the old row. Backup + verify.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

// [old, new] in dependency-safe order
const MOVES: [number, number][] = [
  [340, 360], [341, 361], [342, 362], [343, 363], // phase 1: Solar out
  [1911, 340], [1912, 341], [1913, 342], [1914, 343], // phase 2: Network in
  [335, 332], [336, 333], // phase 3: Equipment in
];
const CHILD: [string, string][] = [
  ["measure_dimension_scope", "measure_id"],
  ["measure_dimension_applicability", "measure_id"],
  ["input_dl_def_mappings", "measure_def_id"],
  ["input_relevance", "measure_def_id"],
  ["tariff_relevance", "measure_def_id"],
  ["transmission_relevance", "measure_def_id"],
  ["data_entries", "measure_def_id"],
];

async function main() {
  // backup
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS backup`);
  for (const t of ["measure_definitions", "measure_dimension_scope", "measure_dimension_applicability", "input_dl_def_mappings"]) {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS backup.${t}_pre_renumber`));
    await db.execute(sql.raw(`CREATE TABLE backup.${t}_pre_renumber AS TABLE public.${t}`));
  }
  const beforeCount = ((await db.execute(sql`SELECT count(*)::int n FROM measure_definitions`)).rows ?? [])[0] as any;

  const cols = ((await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='measure_definitions' ORDER BY ordinal_position`)).rows ?? []).map((r: any) => r.column_name as string);
  const colList = cols.map((c) => `"${c}"`).join(", ");

  await db.transaction(async (tx) => {
    for (const [OLD, NEW] of MOVES) {
      const selList = cols.map((c) => (c === "id" ? String(NEW) : `"${c}"`)).join(", ");
      await tx.execute(sql.raw(`INSERT INTO measure_definitions (${colList}) SELECT ${selList} FROM measure_definitions WHERE id=${OLD}`));
      for (const [t, col] of CHILD) {
        await tx.execute(sql.raw(`UPDATE ${t} SET ${col}=${NEW} WHERE ${col}=${OLD}`));
      }
      // guard: nothing still references OLD before we delete it (else CASCADE would silently drop it)
      let leftover = 0;
      for (const [t, col] of CHILD) {
        const r = ((await tx.execute(sql.raw(`SELECT count(*)::int n FROM ${t} WHERE ${col}=${OLD}`))).rows ?? [])[0] as any;
        leftover += r.n;
      }
      if (leftover > 0) throw new Error(`move ${OLD}->${NEW}: ${leftover} child rows still on ${OLD}, aborting`);
      await tx.execute(sql.raw(`DELETE FROM measure_definitions WHERE id=${OLD}`));
      console.log(`moved ${OLD} -> ${NEW}`);
    }
  });

  // reset sequence past the max id
  const seq = ((await db.execute(sql`SELECT pg_get_serial_sequence('measure_definitions','id') s`)).rows ?? [])[0] as any;
  if (seq?.s) await db.execute(sql.raw(`SELECT setval('${seq.s}', (SELECT max(id) FROM measure_definitions))`));

  // verify
  const afterCount = ((await db.execute(sql`SELECT count(*)::int n FROM measure_definitions`)).rows ?? [])[0] as any;
  const oldGone = (await db.execute(sql`SELECT id FROM measure_definitions WHERE id IN (335,336,1911,1912,1913,1914) OR (id IN (340,341,342,343) AND name ILIKE 'Solar%')`)).rows ?? [];
  const newRows = (await db.execute(sql`SELECT id, name, is_active FROM measure_definitions WHERE id IN (332,333,340,341,342,343,360,361,362,363) ORDER BY id`)).rows ?? [];
  // orphan check: any child pointing to a non-existent measure?
  let orphans = 0;
  for (const [t, col] of CHILD) {
    const r = ((await db.execute(sql.raw(`SELECT count(*)::int n FROM ${t} x LEFT JOIN measure_definitions m ON m.id=x.${col} WHERE m.id IS NULL`))).rows ?? [])[0] as any;
    orphans += r.n;
  }
  console.log(`\ncount before/after: ${beforeCount.n} / ${afterCount.n} (should match)`);
  console.log("old source ids remaining (should be empty):", JSON.stringify(oldGone));
  console.log("orphaned child rows (should be 0):", orphans);
  console.log("\nnew id layout:");
  newRows.forEach((x: any) => console.log(`  ${x.id} | ${x.name} | active=${x.is_active}`));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
