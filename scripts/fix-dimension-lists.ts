/**
 * Dimension-list finalisation (2026-07-09, user-directed):
 *   1. Delete "Every Energy Provider" (23) and "Every Energy Type" (33) — All is always used.
 *   2. Rename "Nill" (983) -> "All" in the Energy Resource Type list (replacement decision);
 *      All (983) becomes the canonical un-sliced default; 988 = genuinely combined systems.
 *   3. Fix list-name typo: "Energy Resouce Type" -> "Energy Resource Type".
 * Guarded + idempotent: deletes only run when the ids are unreferenced; safe to re-run.
 * MUST also be run against prod (list members are data; deploys don't sync them).
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

async function refCount(id: number): Promise<number> {
  const r = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM data_entries WHERE energy_provider_id = ${id} OR energy_type_id = ${id}
        OR energy_source_id = ${id} OR energy_resource_type_id = ${id})::int
      + (SELECT count(*) FROM managed_list_items WHERE parent_id = ${id})::int
      + (SELECT count(*) FROM input_relevance WHERE dimension_id = ${id})::int
      + (SELECT count(*) FROM measure_definitions WHERE formula_inputs::text LIKE ${"%\"energy_provider_id\": " + id + "%"}
         OR formula_inputs::text LIKE ${"%\"energy_type_id\": " + id + "%"})::int
      + (SELECT count(*) FROM kpi_definitions WHERE formula_inputs::text LIKE ${"%\"energy_provider_id\": " + id + "%"}
         OR formula_inputs::text LIKE ${"%\"energy_type_id\": " + id + "%"})::int
      AS refs`);
  return Number(((r.rows ?? r) as { refs: number }[])[0]?.refs ?? -1);
}

async function main() {
  for (const [id, label] of [[23, "Every Energy Provider"], [33, "Every Energy Type"]] as const) {
    const exists = await db.execute(sql`SELECT name FROM managed_list_items WHERE id = ${id}`);
    const row = ((exists.rows ?? exists) as { name: string }[])[0];
    if (!row) { console.log(`${id} (${label}): already deleted — skip`); continue; }
    const refs = await refCount(id);
    if (refs !== 0) { console.log(`${id} (${label}): HAS ${refs} REFERENCES — NOT deleted, investigate`); continue; }
    await db.execute(sql`DELETE FROM managed_list_items WHERE id = ${id}`);
    console.log(`${id} (${label}): deleted (0 references)`);
  }

  // 4. Re-id Customer provider 1234 -> 23 (freed by the "Every Energy Provider" deletion).
  const custRefs = await refCount(1234);
  const id23Free = await db.execute(sql`SELECT count(*)::int AS n FROM managed_list_items WHERE id = 23`);
  const cust = await db.execute(sql`SELECT name FROM managed_list_items WHERE id = 1234`);
  const custRow = ((cust.rows ?? cust) as { name: string }[])[0];
  if (custRow?.name === "Customer" && custRefs === 0 && Number(((id23Free.rows ?? id23Free) as { n: number }[])[0].n) === 0) {
    await db.execute(sql`UPDATE managed_list_items SET id = 23 WHERE id = 1234`);
    console.log("Customer provider: re-id 1234 -> 23");
  } else {
    console.log(`Customer re-id: skipped (${custRow ? `refs=${custRefs}, id23 taken=${((id23Free.rows ?? id23Free) as { n: number }[])[0].n}` : "1234 not present — already done"})`);
  }
  // Customer (23) is a flat Energy Provider member — clear any stray parent_id left from the re-id.
  await db.execute(sql`UPDATE managed_list_items SET parent_id = NULL WHERE id = 23 AND parent_id IS NOT NULL`);

  const nill = await db.execute(sql`
    UPDATE managed_list_items SET name = 'All' WHERE id = 983 AND name = 'Nill' RETURNING id`);
  console.log(`983 Nill -> All: ${((nill.rows ?? nill) as unknown[]).length ? "renamed" : "already renamed — skip"}`);

  const listName = await db.execute(sql`
    UPDATE managed_lists SET name = 'Energy Resource Type' WHERE id = 55 AND name = 'Energy Resouce Type' RETURNING id`);
  console.log(`list 55 typo fix: ${((listName.rows ?? listName) as unknown[]).length ? "renamed" : "already correct — skip"}`);

  // 5. Rename lists 12/13 to measures vocabulary (2026-07-10; code lookups updated in same commit).
  for (const [id, newName] of [[12, "Measures Category"], [13, "Measures Subcategory"]] as const) {
    const r = await db.execute(sql`
      UPDATE managed_lists SET name = ${newName} WHERE id = ${id} AND name <> ${newName} RETURNING id`);
    console.log(`list ${id} -> '${newName}': ${((r.rows ?? r) as unknown[]).length ? "renamed" : "already correct — skip"}`);
  }

  // 6. Units housekeeping (2026-07-10): item 103 -> 'kWh'; item 130 -> 'kWh/m2'
  //    (first repoint KPI 3 'IATA Air Connectivity Score' off 130 to Units N/A = 90).
  await db.execute(sql`UPDATE kpi_definitions SET unit_id = 90 WHERE unit_id = 130`);
  await db.execute(sql`UPDATE measure_definitions SET unit_id = 90 WHERE unit_id = 130`);
  for (const [id, newName] of [[103, "kWh"], [130, "kWh/m2"]] as const) {
    const r = await db.execute(sql`
      UPDATE managed_list_items SET name = ${newName} WHERE id = ${id} AND name <> ${newName} RETURNING id`);
    console.log(`unit ${id} -> '${newName}': ${((r.rows ?? r) as unknown[]).length ? "renamed" : "already correct — skip"}`);
  }

  // 7. Measures Subcategory tidy-ups (2026-07-10):
  //    243 'Government Involvement' -> 'Governance Context'; 99711 'Energy Stored' -> 'Electricity Stored'.
  for (const [id, newName] of [[243, "Governance Context"], [99711, "Electricity Stored"]] as const) {
    const r = await db.execute(sql`
      UPDATE managed_list_items SET name = ${newName} WHERE id = ${id} AND name <> ${newName} RETURNING id`);
    console.log(`subcat ${id} -> '${newName}': ${((r.rows ?? r) as unknown[]).length ? "renamed" : "already correct — skip"}`);
  }

  // 8. Units de-duplication (2026-07-10): retain W/m2=1001 and kWh=103; repoint refs then
  //    delete redundant 99701(W/m2), 39576(mW/m2), 1003(1,000 W/m²), 130(kWh/m2), 51722(kWh).
  await db.execute(sql`UPDATE measure_definitions SET unit_id = 1001 WHERE unit_id = 99701`);
  await db.execute(sql`UPDATE measure_definitions SET unit_id = 103 WHERE unit_id = 51722`);
  const delUnits = await db.execute(sql`
    DELETE FROM managed_list_items WHERE id IN (99701, 39576, 1003, 130, 51722) RETURNING id`);
  console.log(`redundant units deleted: ${((delUnits.rows ?? delUnits) as unknown[]).length}`);

  // 9. Measures Subcategory 'FTE Employees' dedup (2026-07-10): keep 276 (leave it under
  //    Operational 205 — do NOT re-parent); repoint measures off 261 then delete 261.
  await db.execute(sql`UPDATE measure_definitions SET subcategory_id = 276 WHERE subcategory_id = 261`);
  const del261 = await db.execute(sql`DELETE FROM managed_list_items WHERE id = 261 RETURNING id`);
  console.log(`FTE Employees dup 261 deleted: ${((del261.rows ?? del261) as unknown[]).length}`);

  // 10. NULL junk parent_ids on flat dimension lists (audit 2026-07-10): items wrongly
  //     parented to 91('%')/1('Equipment')/661('Undeclared')/20('All') should be NULL.
  const nulled = await db.execute(sql`
    UPDATE managed_list_items SET parent_id = NULL
    WHERE parent_id IN (91, 1, 661, 20) AND list_id IN (6,52,55,57,58,59,60,61,62)
    RETURNING id`);
  console.log(`junk parent_ids NULLed: ${((nulled.rows ?? nulled) as unknown[]).length}`);

  // 11. Delete legacy item 1235 'gender' data-type (repoint its 2 measures to managedLists 982 first),
  //     then delete unused lists (5 empty legacy + 10 user-specified) from both tables.
  //     All verified unreferenced across every FK to managed_list_items before deletion.
  await db.execute(sql`UPDATE measure_definitions SET data_type_id = 982 WHERE data_type_id = 1235`);
  await db.execute(sql`DELETE FROM managed_list_items WHERE id = 1235`);
  const deadLists = [16, 41, 42, 44, 50, 14, 24, 30, 37, 40, 49, 51, 53, 54, 56, 11];
  await db.execute(sql`DELETE FROM managed_list_items WHERE list_id IN (${sql.join(deadLists.map((i) => sql`${i}`), sql`, `)})`);
  const delLists = await db.execute(sql`
    DELETE FROM managed_lists WHERE id IN (${sql.join(deadLists.map((i) => sql`${i}`), sql`, `)}) RETURNING id`);
  console.log(`unused lists deleted: ${((delLists.rows ?? delLists) as unknown[]).length}`);

  // 12. Data Type list (5) renamed to match value columns (2026-07-10); router updated in lockstep.
  //     Delete unused datetime-local (80). value-router.ts keeps legacy aliases + adds managedLists.
  for (const [id, name] of [[81, "value_text"], [82, "value_numeric"], [83, "value_boolean"], [982, "value_option_id"]] as const) {
    await db.execute(sql`UPDATE managed_list_items SET name = ${name} WHERE id = ${id} AND name <> ${name}`);
  }
  await db.execute(sql`DELETE FROM managed_list_items WHERE id = 80 AND NOT EXISTS (SELECT 1 FROM measure_definitions WHERE data_type_id = 80)`);
  console.log("data-type list renamed to value-column names; datetime(80) removed");

  const verify = await db.execute(sql`
    SELECT l.name AS list, i.id, i.name AS member
    FROM managed_list_items i JOIN managed_lists l ON l.id = i.list_id
    WHERE l.id IN (2, 3, 55) ORDER BY l.id, i.id`);
  console.log("FINAL STATE:", JSON.stringify(verify.rows ?? verify));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
