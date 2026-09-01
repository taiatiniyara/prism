/**
 * Adds measure_definitions.option_list_id (FK -> managed_lists) so option-typed
 * (managedLists) measures declare their source list EXPLICITLY, instead of the
 * fragile "measure name == list name" convention. Backfills the 7 name-matched
 * measures + the 2 gender measures (-> Gender list 52). Idempotent; run on prod too.
 * Follow-on (app): the data-entry option input must read option_list_id (and exclude
 * the list's All-member from selectable values) instead of name-matching.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

// measure name (lower) -> source managed_lists.id (verified 2026-07-10)
const BACKFILL: Record<string, number> = {
  "fuel supply access": 27,
  "fuel pricing regulation": 26,
  "utility ownership type": 35,
  "accounting standards": 7,
  "power quality standards": 38,
  "electricity regulation": 22,
  "feeder type": 25,
  "gender of ceo": 52,
  "gender of 2ic": 52,
};

async function main() {
  await db.execute(sql`
    ALTER TABLE measure_definitions
      ADD COLUMN IF NOT EXISTS option_list_id integer REFERENCES managed_lists(id)`);
  console.log("option_list_id: ensured");

  let set = 0;
  for (const [name, listId] of Object.entries(BACKFILL)) {
    const r = await db.execute(sql`
      UPDATE measure_definitions SET option_list_id = ${listId}
      WHERE lower(name) = ${name} AND data_type_id = 982
        AND (option_list_id IS DISTINCT FROM ${listId})
      RETURNING id`);
    const n = ((r.rows ?? r) as unknown[]).length;
    if (n) { set += n; console.log(`${name} -> list ${listId} (${n})`); }
  }

  // Safety: any remaining managedLists-typed measure without a source list?
  const gaps = await db.execute(sql`
    SELECT id, name FROM measure_definitions
    WHERE data_type_id = 982 AND option_list_id IS NULL ORDER BY id`);
  console.log(`backfilled ${set}; option-typed measures still missing a list:`,
    JSON.stringify(gaps.rows ?? gaps));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
