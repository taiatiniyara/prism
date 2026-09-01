import { db } from "@/db/connection";
import { energyResources } from "@/db/schema/utility";
import { sql } from "drizzle-orm";

interface OldEntry {
  utility_report_period_id?: number;
  report_period_id?: number;
  capacity_mw: number | null;
  is_active: boolean;
}

interface NewEntry {
  report_period_id: number;
  capacity_mw: number | null;
  is_active: boolean;
}

async function main() {
  const ers = await db.select({
    id: energyResources.id,
    name: energyResources.name,
    period_entries: energyResources.period_entries,
  }).from(energyResources);

  let fixed = 0;
  for (const er of ers) {
    const entries = (er.period_entries ?? []) as OldEntry[];
    if (entries.length === 0) continue;

    let needsFix = false;
    const fixedEntries: NewEntry[] = entries.map((e: OldEntry) => {
      if (e.utility_report_period_id && !e.report_period_id) {
        needsFix = true;
        return { report_period_id: e.utility_report_period_id, capacity_mw: e.capacity_mw, is_active: e.is_active };
      }
      return { report_period_id: e.report_period_id ?? e.utility_report_period_id ?? 0, capacity_mw: e.capacity_mw, is_active: e.is_active };
    });

    if (!needsFix) continue;

    await db.update(energyResources)
      .set({ period_entries: fixedEntries })
      .where(sql`${energyResources.id} = ${er.id}`);
    fixed++;
  }

  console.log(`Fixed ${fixed} of ${ers.length} energy resources`);

  // Verify
  const sample = await db.select({ id: energyResources.id, period_entries: energyResources.period_entries })
    .from(energyResources).limit(3);
  for (const s of sample) {
    console.log(`ER ${s.id}:`, JSON.stringify(s.period_entries));
  }

  process.exit(0);
}

main().catch(console.error);
