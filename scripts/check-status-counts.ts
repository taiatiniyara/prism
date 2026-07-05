import { db } from "@/db/connection";
import { dataEntries, inputDefinitions, inputRelevance } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { energyResources, serviceAreas } from "@/db/schema/utility";
import { sql, count, eq } from "drizzle-orm";

async function main() {
  // Status distribution across ALL entries
  const byStatus = await db
    .select({ status_id: dataEntries.status_id, cnt: count() })
    .from(dataEntries)
    .where(eq(dataEntries.is_deleted, false))
    .groupBy(dataEntries.status_id)
    .orderBy(dataEntries.status_id);
  
  const labels: Record<number, string> = {
    1: "Requested", 2: "Pending", 3: "Entered",
    4: "Reviewed", 5: "Approved", 6: "Endorsed", 7: "Not_Available",
  };
  console.log("=== Overall Status Distribution ===");
  for (const s of byStatus) {
    console.log(`  ${labels[s.status_id] ?? `?(${s.status_id})`}: ${s.cnt.toLocaleString()}`);
  }

  // is_relevant distribution
  const byRelevance = await db
    .select({ relevant: dataEntries.is_relevant, cnt: count() })
    .from(dataEntries)
    .where(eq(dataEntries.is_deleted, false))
    .groupBy(dataEntries.is_relevant);
  console.log("  By is_relevant:");
  for (const r of byRelevance) {
    console.log(`    relevant=${r.relevant}: ${r.cnt.toLocaleString()}`);
  }

  // Value present vs absent
  const withValue = await db
    .select({ cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.is_deleted} = false AND ${dataEntries.value} IS NOT NULL AND ${dataEntries.value} != ''`);
  const withoutValue = await db
    .select({ cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.is_deleted} = false AND (${dataEntries.value} IS NULL OR ${dataEntries.value} = '')`);
  console.log(`  With value: ${withValue[0].cnt.toLocaleString()}`);
  console.log(`  Without value: ${withoutValue[0].cnt.toLocaleString()}`);

  // Sample breakdown per report period
  console.log("\n=== Per Report Period (first 10) ===");
  const rpCounts = await db
    .select({
      rpId: dataEntries.report_period_id,
      total: count(),
      entered: sql<number>`count(case when ${dataEntries.status_id} = 3 then 1 end)`,
      reviewed: sql<number>`count(case when ${dataEntries.status_id} = 4 then 1 end)`,
      approved: sql<number>`count(case when ${dataEntries.status_id} = 5 then 1 end)`,
      endorsed: sql<number>`count(case when ${dataEntries.status_id} = 6 then 1 end)`,
      notAvail: sql<number>`count(case when ${dataEntries.status_id} = 7 then 1 end)`,
      pending: sql<number>`count(case when ${dataEntries.status_id} = 2 then 1 end)`,
      withVal: sql<number>`count(case when ${dataEntries.value} IS NOT NULL AND ${dataEntries.value} != '' then 1 end)`,
    })
    .from(dataEntries)
    .where(eq(dataEntries.is_deleted, false))
    .groupBy(dataEntries.report_period_id)
    .orderBy(dataEntries.report_period_id)
    .limit(10);
  
  for (const r of rpCounts) {
    console.log(`  RP ${r.rpId}: total=${r.total} entered=${r.entered} reviewed=${r.reviewed} approved=${r.approved} endorsed=${r.endorsed} na=${r.notAvail} pending=${r.pending} withVal=${r.withVal}`);
  }

  // Check: how many entries have status 2 (Pending) but also have values?
  const pendingWithValue = await db
    .select({ cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.status_id} = 2 AND ${dataEntries.value} IS NOT NULL AND ${dataEntries.value} != '' AND ${dataEntries.is_deleted} = false`);
  console.log(`\n  Pending (status 2) entries WITH values: ${pendingWithValue[0].cnt}`);

  // Entered with no value
  const enteredNoValue = await db
    .select({ cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.status_id} = 3 AND (${dataEntries.value} IS NULL OR ${dataEntries.value} = '') AND ${dataEntries.is_deleted} = false`);
  console.log(`  Entered (status 3) entries WITHOUT values: ${enteredNoValue[0].cnt}`);

  // Endorsed with no value
  const endorsedNoValue = await db
    .select({ cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.status_id} = 6 AND (${dataEntries.value} IS NULL OR ${dataEntries.value} = '') AND ${dataEntries.is_deleted} = false`);
  console.log(`  Endorsed (status 6) entries WITHOUT values: ${endorsedNoValue[0].cnt}`);

  // Status 1 (Requested) entries
  const requested = await db
    .select({ cnt: count() })
    .from(dataEntries)
    .where(sql`${dataEntries.status_id} = 1 AND ${dataEntries.is_deleted} = false`);
  console.log(`  Requested (status 1): ${requested[0].cnt}`);

  // Total active input defs
  const activeInputDefs = await db
    .select({ cnt: count() })
    .from(inputDefinitions)
    .where(eq(inputDefinitions.is_active, true));
  console.log(`\n  Active input definitions: ${activeInputDefs[0].cnt}`);

  // Total SAs
  const saCnt = await db.select({ cnt: count() }).from(serviceAreas);
  console.log(`  Service areas: ${saCnt[0].cnt}`);

  // Total ERs
  const erCnt = await db.select({ cnt: count() }).from(energyResources);
  console.log(`  Energy resources: ${erCnt[0].cnt}`);

  // Total RPs
  const rpCnt = await db.select({ cnt: count() }).from(reportPeriods);
  console.log(`  Report periods: ${rpCnt[0].cnt}`);

  // Input relevance counts
  const irCnt = await db.select({ cnt: count() }).from(inputRelevance);
  console.log(`  Input relevance rows: ${irCnt[0].cnt}`);

  process.exit(0);
}

main().catch(console.error);
