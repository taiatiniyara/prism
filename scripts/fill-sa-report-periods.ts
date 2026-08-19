import "dotenv/config";
import { db } from "@/db/connection";
import { serviceAreas } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { eq, sql } from "drizzle-orm";

async function main() {
  console.log("=== Filling service_areas.report_periods ===\n");

  const sas = await db
    .select({ id: serviceAreas.id, name: serviceAreas.name, utility_id: serviceAreas.utility_id })
    .from(serviceAreas);

  const rps = await db
    .select({ id: reportPeriods.id, utility_id: reportPeriods.utility_id })
    .from(reportPeriods);

  const rpsByOrg = new Map<number, number[]>();
  for (const rp of rps) {
    const list = rpsByOrg.get(rp.utility_id) || [];
    list.push(rp.id);
    rpsByOrg.set(rp.utility_id, list);
  }

  let updated = 0;
  let skipped = 0;

  for (const sa of sas) {
    const rpIds = rpsByOrg.get(sa.utility_id);
    if (!rpIds || rpIds.length === 0) {
      console.log(`  SKIP SA ${sa.id} "${sa.name}" (org ${sa.utility_id}): no report periods`);
      skipped++;
      continue;
    }

    const entries = rpIds.map((id) => ({ report_period_id: id, is_active: true }));
    await db
      .update(serviceAreas)
      .set({ report_periods: entries })
      .where(eq(serviceAreas.id, sa.id));

    updated++;
  }

  console.log(`\nUpdated ${updated} service areas, skipped ${skipped}.`);

  // Verify a few
  const sample = await db
    .select({ id: serviceAreas.id, name: serviceAreas.name, utility_id: serviceAreas.utility_id, report_periods: serviceAreas.report_periods })
    .from(serviceAreas)
    .limit(5);

  console.log("\nSample verification:");
  for (const s of sample) {
    console.log(`  SA ${s.id} "${s.name}" (org ${s.utility_id}): ${s.report_periods.length} periods`);
  }

  // Count total entries
  const all = await db
    .select({ report_periods: serviceAreas.report_periods })
    .from(serviceAreas);
  const totalEntries = all.reduce((sum, s) => sum + s.report_periods.length, 0);
  console.log(`\nTotal report_period entries across all SAs: ${totalEntries}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
