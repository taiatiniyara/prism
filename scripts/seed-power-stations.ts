import { db } from "@/db/connection";
import { powerStations } from "@/db/schema/utility";
import fs from "node:fs";
import path from "node:path";

interface PowerStationRow {
  id: string;
  name: string;
  location_id: string;
  is_active: string;
  updated_by_id: string;
  updated_date: string;
  energy_provider_id: string;
}

function parseCsv(content: string): PowerStationRow[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row as unknown as PowerStationRow;
  });
}

async function seedPowerStations() {
  const existing = await db.select({ id: powerStations.id }).from(powerStations).limit(1);
  if (existing.length > 0) {
    console.log("Power stations already seeded, skipping.");
    return;
  }

  const csvPath = path.resolve(process.cwd(), "docs", "power_station.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(content);

  const values = rows.map((row) => ({
    id: parseInt(row.id, 10),
    name: row.name,
    service_area_id: parseInt(row.location_id, 10),
    utility_id: parseInt(row.energy_provider_id, 10),
    is_active: row.is_active === "1",
  }));

  await db.insert(powerStations).values(values);
  console.log(`Seeded ${values.length} power stations.`);
}

async function main() {
  console.log("Seeding power stations...\n");
  await seedPowerStations();
  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
