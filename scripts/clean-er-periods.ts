import { db } from "@/db/connection";
import { energyResources } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { sql, eq } from "drizzle-orm";

async function main() {
  // Get valid report_period_ids per utility
  const rpRows = await db.select({ id: reportPeriods.id, utility_id: reportPeriods.utility_id }).from(reportPeriods);
  const rpIdsByUtility = new Map<number, Set<number>>();
  for (const rp of rpRows) {
    const existing = rpIdsByUtility.get(rp.utility_id) ?? new Set();
    existing.add(rp.id);
    rpIdsByUtility.set(rp.utility_id, existing);
  }
  console.log(`Loaded ${rpIdsByUtility.size} utilities with valid RPs`);

  const allErs = await db.select({ id: energyResources.id, name: energyResources.name, utility_id: energyResources.utility_id, period_entries: energyResources.period_entries }).from(energyResources);

  let fixed = 0;
  let totalRemoved = 0;
  let skipped = 0;

  for (const er of allErs) {
    const validIds = rpIdsByUtility.get(er.utility_id);
    if (!validIds) { skipped++; continue; }

    const entries = (er.period_entries as Array<{ report_period_id?: number; utility_report_period_id?: number; is_active?: boolean; capacity_mw?: number | null; }>) ?? [];
    if (entries.length === 0) continue;

    const cleaned = entries.filter(e => {
      const rpId = e.report_period_id ?? e.utility_report_period_id;
      return rpId != null && validIds.has(rpId);
    });

    const removed = entries.length - cleaned.length;
    if (removed > 0) {
      // Normalize keys to report_period_id
      const normalized = cleaned.map(e => ({
        report_period_id: e.report_period_id ?? e.utility_report_period_id,
        is_active: e.is_active ?? true,
        capacity_mw: e.capacity_mw ?? null,
      }));

      await db.update(energyResources)
        .set({ period_entries: normalized })
        .where(eq(energyResources.id, er.id));
      fixed++;
      totalRemoved += removed;
    }
  }

  console.log(`Fixed ${fixed} ERs, removed ${totalRemoved} invalid entries, skipped ${skipped} ERs without utility RPs`);
  process.exit(0);
}

main().catch(console.error);
