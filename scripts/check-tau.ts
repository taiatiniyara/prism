import { db } from "@/db/connection";
import { serviceAreas, energyResources } from "@/db/schema/utility";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { eq, and } from "drizzle-orm";

async function main() {
  // TAU utility
  const tau = await db.select({ id: organisations.id, name: organisations.name, acronym: organisations.acronym })
    .from(organisations)
    .where(eq(organisations.acronym, "TAU")).limit(1);
  if (!tau[0]) { console.log("TAU not found"); process.exit(1); }
  const tauId = tau[0].id;
  console.log(`TAU: id=${tauId} name=${tau[0].name}\n`);

  // Service areas for TAU
  const sas = await db.select({ id: serviceAreas.id, name: serviceAreas.name, is_virtual: serviceAreas.is_virtual, is_active: serviceAreas.is_active })
    .from(serviceAreas)
    .where(and(eq(serviceAreas.utility_id, tauId), eq(serviceAreas.is_virtual, false), eq(serviceAreas.is_active, true)));
  console.log(`Service areas (non-virtual, active): ${sas.length}`);
  for (const sa of sas) console.log(`  ${sa.id}: ${sa.name}`);

  // Energy resources for TAU
  const ers = await db.select({ id: energyResources.id, name: energyResources.name, is_virtual: energyResources.is_virtual, period_entries: energyResources.period_entries })
    .from(energyResources)
    .where(and(eq(energyResources.utility_id, tauId), eq(energyResources.is_virtual, false)));
  console.log(`\nEnergy resources (non-virtual): ${ers.length}`);
  for (const er of ers.slice(0, 5)) console.log(`  ${er.id}: ${er.name} (${(er.period_entries as unknown[])?.length ?? 0} periods)`);

  // Active RPs for TAU
  const rps = await db.select({ id: reportPeriods.id }).from(reportPeriods).where(eq(reportPeriods.utility_id, tauId));
  console.log(`\nReport periods: ${rps.length}`);
  console.log(`  IDs: ${rps.map(r => r.id).join(', ')}`);

  // Check what the first RP's expected counts look like
  if (rps.length > 0) {
    const rpId = rps[rps.length - 1].id;
    // Count active ERs for this period
    let activeErsInPeriod = 0;
    for (const er of ers) {
      const entries = (er.period_entries as Array<{ report_period_id: number; is_active: boolean }>) ?? [];
      if (entries.some((e) => e.report_period_id === rpId && e.is_active)) {
        activeErsInPeriod++;
      }
    }
    console.log(`\nFor RP ${rpId}:`);
    console.log(`  Active ERs in this period: ${activeErsInPeriod}`);
    console.log(`  Estimated Requested: 121 non-gen × ${sas.length} SAs + 339 gen × ${activeErsInPeriod} ERs = ${121 * sas.length + 339 * activeErsInPeriod}`);
  }

  process.exit(0);
}
main().catch(console.error);
