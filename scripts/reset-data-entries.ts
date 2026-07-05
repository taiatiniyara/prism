import { db } from "@/db/connection";
import { dataEntries, dataEntryLogs } from "@/db/schema/dataEntry";
import { serviceAreas as saTable, energyResources as erTable } from "@/db/schema/utility";
import { sql } from "drizzle-orm";

async function main() {
  // 1. Wipe corrupted data entries
  console.log("Deleting all data entries...");
  await db.delete(dataEntryLogs);
  await db.delete(dataEntries);
  console.log("  Done.\n");

  // 2. Check what's in service_areas and energy_resources
  const saCount = await db.select({ cnt: sql<number>`count(*)` }).from(saTable);
  const erCount = await db.select({ cnt: sql<number>`count(*)` }).from(erTable);
  console.log(`service_areas: ${saCount[0].cnt} rows`);
  console.log(`energy_resources: ${erCount[0].cnt} rows`);

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
