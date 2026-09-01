/**
 * Splits the 4 Downtime measures into Generator (equipment) + Network (T&D function) variants.
 * Existing id -> Generator variant (renamed, strata 1, resource_type=Generator, drop
 * utility_function). New id -> Network variant (strata 3, utility_function by_context {Trans,Dist}).
 * Updates DB (measure_definitions, scope, applicability), then rebuilds the JSONs + workbooks.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

const DIMS = ["provider", "type", "source", "resource_type", "customer_type", "payment_mode", "band", "division", "gender", "utility_function"];
// [existingId, kind, newNetworkId]
const SPLITS = [
  { gen: 330, net: 1911, base: "Planned Downtime Events" },
  { gen: 331, net: 1912, base: "Planned Downtime Hours" },
  { gen: 335, net: 1913, base: "Unplanned Downtime Events" },
  { gen: 336, net: 1914, base: "Unplanned Downtime Hours" },
];
const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
const DEF = (variant: "Generator" | "Network", base: string) =>
  variant === "Generator"
    ? `The ${/hours/i.test(base) ? "total hours a generating unit was out of service" : "number of outage events for a generating unit"} due to ${/unplanned/i.test(base) ? "unplanned (forced) outages — trips and component failures" : "planned (scheduled) maintenance"} during the period, recorded at equipment grain per generating unit. Sliced by the unit's provider/type/source via the registry. Generator downtime only — network downtime is a separate measure.`
    : `The ${/hours/i.test(base) ? "total hours the transmission or distribution network was out of service" : "number of network outage events"} due to ${/unplanned/i.test(base) ? "unplanned (fault) outages" : "planned (scheduled) works"} during the period, attributed to the utility function (Transmission or Distribution). Network downtime only — generating-unit downtime is a separate measure.`;

async function main() {
  for (const s of SPLITS) {
    // clone source row for the network variant, then mutate generator variant
    const src = ((await db.execute(sql`SELECT * FROM measure_definitions WHERE id=${s.gen}`)).rows ?? [])[0] as any;
    // 1a. Generator variant: rename + strata 1 + definition
    const gName = `Generator ${s.base}`;
    await db.execute(sql`UPDATE measure_definitions SET name=${gName}, variable_name=${slug(gName)}, strata_id=1, definition=${DEF("Generator", s.base)}, updated_at=now() WHERE id=${s.gen}`);
    // 1b. Network variant: new row
    const nName = `Network ${s.base}`;
    await db.execute(sql`
      INSERT INTO measure_definitions (id, name, variable_name, definition, definition_status, category_id, subcategory_id, unit_id, data_type_id, strata_id, sort_order, is_currency, is_calculated, is_active, updated_at)
      VALUES (${s.net}, ${nName}, ${slug(nName)}, ${DEF("Network", s.base)}, 'draft', ${src.category_id}, ${src.subcategory_id}, ${src.unit_id}, ${src.data_type_id}, 3, ${src.sort_order ?? 0}, false, false, true, now())
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, variable_name=EXCLUDED.variable_name, definition=EXCLUDED.definition, strata_id=3, is_active=true, updated_at=now()`);

    // 2. scope
    // generator: drop utility_function (already provider/type/source/resource_type by_context)
    await db.execute(sql`UPDATE measure_dimension_scope SET expansion_mode='not_applicable' WHERE measure_id=${s.gen} AND dimension='utility_function'`);
    // network: fresh 10 rows, only utility_function by_context
    await db.execute(sql`DELETE FROM measure_dimension_scope WHERE measure_id=${s.net}`);
    for (const d of DIMS) await db.execute(sql`INSERT INTO measure_dimension_scope (measure_id, dimension, expansion_mode) VALUES (${s.net}, ${d}, ${d === "utility_function" ? "by_context" : "not_applicable"})`);

    // 3. applicability
    // generator: keep resource_type=Generator, remove any utility_function rows
    await db.execute(sql`DELETE FROM measure_dimension_applicability WHERE measure_id=${s.gen} AND dimension='utility_function'`);
    await db.execute(sql`INSERT INTO measure_dimension_applicability (measure_id, dimension, member_id) VALUES (${s.gen}, 'resource_type', 984) ON CONFLICT DO NOTHING`);
    // network: utility_function = {Distribution 1025, Transmission 1026}
    await db.execute(sql`DELETE FROM measure_dimension_applicability WHERE measure_id=${s.net}`);
    for (const m of [1025, 1026]) await db.execute(sql`INSERT INTO measure_dimension_applicability (measure_id, dimension, member_id) VALUES (${s.net}, 'utility_function', ${m})`);
    console.log(`split ${s.base}: [${s.gen}] Generator + [${s.net}] Network`);
  }

  // rebuild scope + applicability JSONs from DB (source of truth now)
  const scopeRows = ((await db.execute(sql`SELECT s.measure_id, m.name AS measure_name, s.dimension, s.expansion_mode FROM measure_dimension_scope s JOIN measure_definitions m ON m.id=s.measure_id ORDER BY s.measure_id, s.dimension`)).rows ?? []);
  writeFileSync("docs/measures-enrichment/measure-dimension-scope-final.json", JSON.stringify(scopeRows, null, 1));
  const applRows = ((await db.execute(sql`SELECT a.measure_id, m.name AS measure_name, a.dimension, a.member_id FROM measure_dimension_applicability a JOIN measure_definitions m ON m.id=a.measure_id ORDER BY a.measure_id, a.dimension, a.member_id`)).rows ?? []);
  // preserve basis/review from existing json where possible
  const prev = JSON.parse(readFileSync("docs/measures-enrichment/measure-dimension-applicability.json", "utf8"));
  const prevKey = new Map(prev.map((r: any) => [`${r.measure_id}|${r.dimension}|${r.member_id}`, r]));
  const applOut = (applRows as any[]).map((r) => { const p = prevKey.get(`${r.measure_id}|${r.dimension}|${r.member_id}`); return { ...r, basis: p?.basis ?? (r.dimension === "utility_function" ? "network downtime → T&D" : r.dimension === "resource_type" ? "generator downtime → Generator" : ""), review: p?.review ?? false }; });
  writeFileSync("docs/measures-enrichment/measure-dimension-applicability.json", JSON.stringify(applOut, null, 1));

  const v = await db.execute(sql`SELECT
    (SELECT count(*) FROM measure_definitions WHERE is_active)::int measures,
    (SELECT count(*) FROM measure_dimension_scope)::int scope,
    (SELECT count(*) FROM measure_dimension_applicability)::int applicability`);
  console.log("AFTER:", JSON.stringify((v.rows ?? v)[0]));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
