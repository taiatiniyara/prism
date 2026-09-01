/**
 * Drops utility_function from pure-generation measures (user decision 2026-07-22):
 * where utility_function applicability = {Generation 1024} only, it's a constant tag not a
 * varying dimension. Sets scope utility_function -> not_applicable and removes applicability rows.
 * Updates the DB (scope + applicability) and the source JSONs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/db/connection";

const GEN = 1024;

async function main() {
  const appl = JSON.parse(readFileSync("docs/measures-enrichment/measure-dimension-applicability.json", "utf8"));
  const scope = JSON.parse(readFileSync("docs/measures-enrichment/measure-dimension-scope-final.json", "utf8"));

  // measures whose utility_function applicability is exactly {1024}
  const ufByMeasure = new Map<number, number[]>();
  for (const r of appl) if (r.dimension === "utility_function") { if (!ufByMeasure.has(r.measure_id)) ufByMeasure.set(r.measure_id, []); ufByMeasure.get(r.measure_id)!.push(r.member_id); }
  const targets = [...ufByMeasure.entries()].filter(([, m]) => m.length === 1 && m[0] === GEN).map(([id]) => id);
  console.log("pure-generation measures losing utility_function:", targets.length, JSON.stringify(targets));

  // 1. scope JSON: utility_function -> not_applicable for targets
  for (const s of scope) if (s.dimension === "utility_function" && targets.includes(s.measure_id)) s.expansion_mode = "not_applicable";
  writeFileSync("docs/measures-enrichment/measure-dimension-scope-final.json", JSON.stringify(scope, null, 1));

  // 2. applicability JSON: drop utility_function rows for targets
  const applKept = appl.filter((r: any) => !(r.dimension === "utility_function" && targets.includes(r.measure_id)));
  writeFileSync("docs/measures-enrichment/measure-dimension-applicability.json", JSON.stringify(applKept, null, 1));

  // 3. DB
  for (const id of targets) {
    await db.execute(sql`UPDATE measure_dimension_scope SET expansion_mode='not_applicable' WHERE measure_id=${id} AND dimension='utility_function'`);
    await db.execute(sql`DELETE FROM measure_dimension_applicability WHERE measure_id=${id} AND dimension='utility_function'`);
  }

  const v = await db.execute(sql`SELECT
    (SELECT count(*) FROM measure_dimension_scope WHERE expansion_mode='by_context')::int by_context,
    (SELECT count(*) FROM measure_dimension_scope WHERE dimension='utility_function' AND expansion_mode='by_context')::int uf_by_context,
    (SELECT count(*) FROM measure_dimension_applicability)::int applicability_rows`);
  console.log("AFTER:", JSON.stringify((v.rows ?? v)[0]));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
