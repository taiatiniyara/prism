import { db } from "@/db/connection";
import { dataEntries } from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { sql, eq, and } from "drizzle-orm";

async function main() {
  // TAU = utility 24, periods = 193, 208, 230, 260
  const tauRps = [193, 208, 230, 260];
  
  // Get names of TAU periods
  const rps = await db.select({ id: reportPeriods.id, date: reportPeriods.report_date, type: reportPeriods.report_type_id })
    .from(reportPeriods)
    .where(sql`${reportPeriods.id} IN (${sql.join(tauRps.map(String), sql`,`)})`);
  console.log("TAU report periods:");
  for (const r of rps) console.log(`  ${r.id}: ${r.date.toISOString().split('T')[0]} type=${r.type}`);

  // Status distribution per RP
  for (const rpId of tauRps) {
    const byStatus = await db
      .select({ status_id: dataEntries.status_id, cnt: sql<number>`count(*)` })
      .from(dataEntries)
      .where(and(eq(dataEntries.report_period_id, rpId), eq(dataEntries.is_deleted, false)))
      .groupBy(dataEntries.status_id);
    
    const labels: Record<number, string> = {1:"Req",2:"Pend",3:"Enter",4:"Rev",5:"Appr",6:"Endo",7:"NA"};
    const statuses = byStatus.map(s => `${labels[s.status_id]??s.status_id}=${s.cnt}`).join(', ');
    
    // Count by is_relevant
    const byRel = await db
      .select({ relevant: dataEntries.is_relevant, cnt: sql<number>`count(*)` })
      .from(dataEntries)
      .where(and(eq(dataEntries.report_period_id, rpId), eq(dataEntries.is_deleted, false)))
      .groupBy(dataEntries.is_relevant);
    const relInfo = byRel.map(r => `rel=${r.relevant}:${r.cnt}`).join(', ');

    console.log(`\nRP ${rpId}: ${statuses}`);
    console.log(`  Relevance: ${relInfo}`);
  }

  process.exit(0);
}
main().catch(console.error);
