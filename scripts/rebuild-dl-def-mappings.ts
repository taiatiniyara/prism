import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(file: string) {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(resolve(".env"));
loadEnv(resolve(".env.local"));

const DUMP_PATH =
  process.env.TRAINING_DL_DEFS_JSON ?? resolve("training-dl-defs.json");

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const COUNTRY_CONTEXT_MAP: Record<number, string> = {
  5203040001: "Land Area",
  5203040002: "Islands",
  5203040003: "IATA Air Connectivity Score",
  5203040004: "Air Connectivity per 1000 People",
  5203040005: "Air Connectivity per Unit GDP",
  5203040006: "Population",
  5203040007: "Urban Population",
  5203040008: "Rural Population",
  5203040009: "Households",
  5203040010: "Average Household Size",
  5203040011: "GDP Per Capita",
  5203040012: "Inflation Rate",
  5203040013: "Unemployment Rate",
  5203040014: "Access to Electricity",
  5203040015: "Fuel Pricing Regulation",
};

async function main() {
  const { db } = await import("@/db/connection");
  const { measureDefinitions, inputDlDefMappings } = await import(
    "@/db/schema/dataEntry"
  );
  const { sql } = await import("drizzle-orm");

  const trainingDefs = JSON.parse(
    readFileSync(DUMP_PATH, "utf8"),
  ) as Array<{
    id: number;
    name: string;
    variable_name: string | null;
  }>;

  const prismDefs = await db.select().from(measureDefinitions);
  const prismByName = new Map<string, number>();
  const prismByVarName = new Map<string, number>();
  for (const d of prismDefs) {
    const nm = norm(d.name);
    if (nm && !prismByName.has(nm)) prismByName.set(nm, d.id);
    if (d.variable_name) {
      const vn = norm(d.variable_name);
      if (vn && !prismByVarName.has(vn)) prismByVarName.set(vn, d.id);
    }
  }

  await db.execute(sql`DELETE FROM input_dl_def_mappings`);

  let created = 0;
  let noMatch = 0;
  const misses: string[] = [];

  for (const t of trainingDefs) {
    let prismId: number | null = null;
    const explicit = COUNTRY_CONTEXT_MAP[t.id];
    if (explicit != null) {
      prismId = prismByName.get(norm(explicit)) ?? null;
    } else {
      const nm = norm(t.name);
      const vn = norm(t.variable_name);
      prismId =
        prismByName.get(nm) ??
        prismByVarName.get(vn) ??
        prismByVarName.get(nm) ??
        prismByName.get(vn) ??
        null;
    }

    if (prismId == null) {
      noMatch++;
      if (misses.length < 200) misses.push(`${t.id} | ${t.name}`);
      continue;
    }

    await db.insert(inputDlDefMappings).values({
      training_dl_def_id: t.id,
      measure_def_id: prismId,
      training_dl_legacy_id: String(t.id),
      training_dl_name: (t.name ?? "").substring(0, 255),
      training_variable_name: t.variable_name?.substring(0, 255),
      confidence: "auto",
      is_auto: true,
      score: 0,
    });
    created++;
  }

  console.log(`created=${created} noMatch=${noMatch}`);
  if (misses.length) {
    console.log("MISSES (first 200):");
    for (const m of misses) console.log("  " + m);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
