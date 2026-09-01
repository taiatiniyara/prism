import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
import { serviceAreas, energyResources } from "@/db/schema/utility";
import { count, sql } from "drizzle-orm";

async function main() {
  const sa = await db.select({ cnt: count() }).from(serviceAreas);
  const er = await db.select({ cnt: count() }).from(energyResources);
  console.log(`service_areas: ${sa[0].cnt} rows`);
  console.log(`energy_resources: ${er[0].cnt} rows`);

  const deWithSa = await db
    .select({ cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.service_area_id} IS NOT NULL`);
  const deWithEr = await db
    .select({ cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.energy_resource_id} IS NOT NULL`);
  console.log(`data_entries with SA FK: ${deWithSa[0].cnt}`);
  console.log(`data_entries with ER FK: ${deWithEr[0].cnt}`);

  const totalDe = await db.select({ cnt: count() }).from(dataEntries);
  console.log(`data_entries total: ${totalDe[0].cnt}`);
  process.exit(0);
}
main().catch(console.error);
