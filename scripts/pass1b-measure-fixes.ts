/**
 * Pass 1b — (1) rename 303; (2) fix the 8 downtime variable_names to the unit-word form
 * (drop Count/Duration redundancy, keep display names); (3) broaden Equipment downtime
 * applicability to include Energy Storage; (4) make those 4 definitions equipment-aware.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";
import { deriveMeasureVariableName } from "@/lib/formatters";

const EQUIP_IDS = [330, 331, 335, 336];
const DOWNTIME_IDS = [330, 331, 335, 336, 1911, 1912, 1913, 1914];
const ENERGY_STORAGE = 985;

const DEF: Record<number, string> = {
  330: "Number of planned (scheduled) outage events for a generation or storage unit during the period, at equipment grain per unit. Sliced by resource type (Generator / Energy Storage) and the unit's provider/type/source via the registry. Equipment downtime only — network (T&D) downtime is a separate measure.",
  331: "Total hours a generation or storage unit was out of service due to planned (scheduled) maintenance during the period, at equipment grain per unit. Sliced by resource type (Generator / Energy Storage) and the unit's provider/type/source. Equipment downtime only — network downtime is separate.",
  335: "Number of unplanned (forced) outage events — trips and component failures — for a generation or storage unit during the period, at equipment grain per unit. Sliced by resource type (Generator / Energy Storage) and the unit's provider/type/source. Equipment downtime only — network downtime is separate.",
  336: "Total hours a generation or storage unit was out of service due to unplanned (forced) outages — trips and component failures — during the period, at equipment grain per unit. Sliced by resource type (Generator / Energy Storage) and the unit's provider/type/source. Equipment downtime only — network downtime is separate.",
};

async function main() {
  const log: any[] = [];

  // (1) rename 303
  const m303 = ((await db.execute(sql`SELECT m.id, m.name, m.variable_name, u.name AS unit FROM measure_definitions m LEFT JOIN managed_list_items u ON u.id=m.unit_id WHERE m.id=303`)).rows ?? [])[0] as any;
  const name303 = "Non-Revenue Electricity Consumed";
  const var303 = deriveMeasureVariableName(name303, m303.unit);
  await db.execute(sql`UPDATE measure_definitions SET name=${name303}, variable_name=${var303}, updated_at=now() WHERE id=303`);
  log.push({ id: 303, change: "rename", from: m303.name, to: name303, varFrom: m303.variable_name, varTo: var303 });

  // (2) fix downtime variable_names: use Events/Hours (unit word), keep display names
  for (const id of DOWNTIME_IDS) {
    const m = ((await db.execute(sql`SELECT m.id, m.name, m.variable_name, u.name AS unit FROM measure_definitions m LEFT JOIN managed_list_items u ON u.id=m.unit_id WHERE m.id=${id}`)).rows ?? [])[0] as any;
    const unitWorded = m.name.replace(/\bCount\b/, "Events").replace(/\bDuration\b/, "Hours");
    const newVar = deriveMeasureVariableName(unitWorded, m.unit);
    await db.execute(sql`UPDATE measure_definitions SET variable_name=${newVar}, updated_at=now() WHERE id=${id}`);
    log.push({ id, change: "variable_name", from: m.variable_name, to: newVar });
  }

  // (3) broaden Equipment downtime applicability: add Energy Storage (985)
  for (const id of EQUIP_IDS) {
    await db.execute(sql`INSERT INTO measure_dimension_applicability (measure_id, dimension, member_id) VALUES (${id}, 'resource_type', ${ENERGY_STORAGE}) ON CONFLICT DO NOTHING`);
    log.push({ id, change: "applicability +", to: "resource_type=985 (Energy Storage)" });
  }

  // (4) equipment-aware definitions
  for (const id of EQUIP_IDS) {
    await db.execute(sql`UPDATE measure_definitions SET definition=${DEF[id]}, updated_at=now() WHERE id=${id}`);
    log.push({ id, change: "definition", to: "equipment-aware (generation or storage)" });
  }

  console.log(JSON.stringify(log, null, 1));
  // verify final applicability
  const a = (await db.execute(sql`SELECT a.measure_id, a.member_id, i.name FROM measure_dimension_applicability a JOIN managed_list_items i ON i.id=a.member_id WHERE a.measure_id IN (330,331,335,336) ORDER BY a.measure_id, a.member_id`)).rows ?? [];
  console.log("\nfinal Equipment applicability:");
  a.forEach((x: any) => console.log("  " + x.measure_id + " resource_type=" + x.member_id + " (" + x.name + ")"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
