/**
 * Pass 1 — rename the 8 downtime measures (Generator→Equipment; Events→Count, Hours→Duration).
 * Ids are NOT touched here (that is pass 2). Regenerates variable_name via the canonical helper.
 * Prints before/after for the change log.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { deriveMeasureVariableName } from "@/lib/formatters";

const RENAMES: { id: number; name: string }[] = [
  { id: 330, name: "Equipment Planned Downtime Count" },
  { id: 331, name: "Equipment Planned Downtime Duration" },
  { id: 335, name: "Equipment Unplanned Downtime Count" },
  { id: 336, name: "Equipment Unplanned Downtime Duration" },
  { id: 1911, name: "Network Planned Downtime Count" },
  { id: 1912, name: "Network Planned Downtime Duration" },
  { id: 1913, name: "Network Unplanned Downtime Count" },
  { id: 1914, name: "Network Unplanned Downtime Duration" },
];

async function main() {
  const log: any[] = [];
  for (const r of RENAMES) {
    const cur = ((await db.execute(sql`
      SELECT m.id, m.name, m.variable_name, u.name AS unit
      FROM measure_definitions m LEFT JOIN managed_list_items u ON u.id=m.unit_id
      WHERE m.id=${r.id}`)).rows ?? [])[0] as any;
    if (!cur) { console.log(`!! id ${r.id} not found`); continue; }
    const newVar = deriveMeasureVariableName(r.name, cur.unit);
    await db.execute(sql`UPDATE measure_definitions SET name=${r.name}, variable_name=${newVar}, updated_at=now() WHERE id=${r.id}`);
    log.push({ id: r.id, unit: cur.unit, oldName: cur.name, newName: r.name, oldVar: cur.variable_name, newVar });
  }
  console.log("id   | unit   | old name -> new name | old var -> new var");
  for (const l of log) console.log(`${l.id} | ${l.unit} | "${l.oldName}" -> "${l.newName}" | ${l.oldVar} -> ${l.newVar}`);
  // machine-readable for the changelog
  console.log("\nJSON:" + JSON.stringify(log));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
