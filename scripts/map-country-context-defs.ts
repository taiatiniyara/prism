import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(file: string) {
  let raw: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
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

const COUNTRY_CONTEXT_MAP: Array<{ trainingId: number; prismName: string }> = [
  { trainingId: 5203040001, prismName: "Land Area" },
  { trainingId: 5203040002, prismName: "Islands" },
  { trainingId: 5203040003, prismName: "IATA Air Connectivity Score" },
  { trainingId: 5203040004, prismName: "Air Connectivity per 1000 People" },
  { trainingId: 5203040005, prismName: "Air Connectivity per Unit GDP" },
  { trainingId: 5203040006, prismName: "Population" },
  { trainingId: 5203040007, prismName: "Urban Population" },
  { trainingId: 5203040008, prismName: "Rural Population" },
  { trainingId: 5203040009, prismName: "Households" },
  { trainingId: 5203040010, prismName: "Average Household Size" },
  { trainingId: 5203040011, prismName: "GDP Per Capita" },
  { trainingId: 5203040012, prismName: "Inflation Rate" },
  { trainingId: 5203040013, prismName: "Unemployment Rate" },
  { trainingId: 5203040014, prismName: "Access to Electricity" },
  { trainingId: 5203040015, prismName: "Fuel Pricing Regulation" },
];

async function main() {
  const { db } = await import("@/db/connection");
  const { measureDefinitions, inputDlDefMappings } = await import(
    "@/db/schema/dataEntry"
  );

  const allDefs = await db.select().from(measureDefinitions);
  const byName = new Map(
    allDefs.map((d) => [d.name.trim().toLowerCase(), d]),
  );

  const existing = await db.select().from(inputDlDefMappings);
  const existingTrainingIds = new Set(
    existing.map((m) => m.training_dl_def_id),
  );

  let created = 0;
  const missed: string[] = [];

  for (const entry of COUNTRY_CONTEXT_MAP) {
    if (existingTrainingIds.has(entry.trainingId)) {
      continue;
    }
    const def = byName.get(entry.prismName.trim().toLowerCase());
    if (!def) {
      missed.push(entry.prismName);
      continue;
    }
    await db.insert(inputDlDefMappings).values({
      training_dl_def_id: entry.trainingId,
      measure_def_id: def.id,
      training_dl_legacy_id: String(entry.trainingId),
      training_dl_name: def.name,
      training_variable_name: def.variable_name,
      confidence: "auto",
      is_auto: true,
      score: 0,
    });
    created++;
  }

  console.log(`Created ${created} country-context mappings.`);
  if (missed.length) {
    console.log("MISSED (no prism measure found):", missed);
  }

  const total = await db.select().from(inputDlDefMappings);
  console.log(`Total input_dl_def_mappings now: ${total.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
