import { db } from "@/db/connection";
import { organisations, serviceAreas, energyResources } from "@/db/schema/utility";
import { managedListItems } from "@/db/schema/managedLists";
import { sql } from "drizzle-orm";

const MIGRATION_KEY = process.env.PRISM_TRAINING_MIGRATION_KEY?.trim() ?? "";

const FYE_MONTH_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Legacy migration API still serves financial_year_end as a "30 Sep 2024" string. */
function parseLegacyFye(
  s: string | null | undefined,
): { month: number; day: number } | null {
  if (!s) return null;
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})/.exec(s.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = FYE_MONTH_NUM[m[2].toLowerCase()];
  return month && day ? { month, day } : null;
}

function log(msg: string) { console.log(msg); }

async function fetchSource(path: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json", Accept: "application/json",
  };
  if (MIGRATION_KEY) headers["x-migration-key"] = MIGRATION_KEY;
  const url = `https://prismdashboard.org/api/migration${path}`;
  log(`  GET ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  } catch (e: unknown) {
    clearTimeout(timeout);
    throw e;
  }
}

async function main() {
  log("=== Sync Prerequisite Tables ===\n");

  const mliIds = new Set((await db.select({ id: managedListItems.id }).from(managedListItems)).map(m => m.id));
  log(`Managed list items: ${mliIds.size}`);

  // ── 1. Sync organisations + service_areas ──
  log("\n[1/2] Fetching /organisation...");
  const orgData = await fetchSource("/organisation");
  const saList: unknown[] = orgData.serviceAreas ?? [];
  const orgList: unknown[] = orgData.organisations ?? [];
  log(`  Got ${orgList.length} orgs, ${saList.length} SAs`);

  const existingOrgIds = new Set((await db.select({ id: organisations.id }).from(organisations)).map(o => o.id));
  let orgIns = 0;
  for (const o of orgList) {
    if (existingOrgIds.has(o.id)) continue;
    try {
      await db.insert(organisations).values({
        id: o.id, name: o.name, acronym: o.acronym, country_id: o.country_id,
        is_utility: o.is_utility ?? true, is_active: o.is_active ?? true,
        is_mth_reports_relevant_month: o.is_mth_reports_relevant ?? false,
        updated_date: o.updated_date,
        // accounting/electricity/powerquality standard ids retired 2026-09-02 (Stage 2) —
        // reported context answers now live in data_entries (measures 51/53/52), not org columns.
        entity_type_id: mliIds.has(o.entity_type_id) ? o.entity_type_id : null,
        utility_type_id: mliIds.has(o.utility_type_id) ? o.utility_type_id : 440,
        operating_basis_id: mliIds.has(o.operating_basis_id) ? o.operating_basis_id : null,
        ppa_membership_type_id: mliIds.has(o.ppa_membership_type_id) ? o.ppa_membership_type_id : null,
        utility_size_id: mliIds.has(o.utility_size_id) ? o.utility_size_id : null,
        services_provided_id: mliIds.has(o.services_provided_id) ? o.services_provided_id : null,
        fye_month: parseLegacyFye((o as { financial_year_end?: string | null }).financial_year_end)?.month ?? null,
        fye_day: parseLegacyFye((o as { financial_year_end?: string | null }).financial_year_end)?.day ?? null,
      });
      orgIns++;
    } catch { /* dup */ }
  }
  log(`  Inserted ${orgIns} orgs`);

  const orgIds = new Set((await db.select({ id: organisations.id }).from(organisations)).map(o => o.id));
  const existingSaIds = new Set((await db.select({ id: serviceAreas.id }).from(serviceAreas)).map(s => s.id));
  let saIns = 0;
  for (const sa of saList) {
    if (existingSaIds.has(sa.id) || !orgIds.has(sa.utility_id)) continue;
    try {
      await db.insert(serviceAreas).values({
        id: sa.id, name: sa.name ?? `SA ${sa.id}`, utility_id: sa.utility_id,
        provides_electricity: true, provides_sanitation: false, provides_water: false,
        operations_only: sa.operations_only ?? false,
        report_periods: sa.report_periods ?? [],
        is_virtual: sa.is_virtual ?? false, is_active: sa.is_active ?? true,
        strata_id: mliIds.has(sa.strata_id) ? sa.strata_id : 1,
      });
      saIns++;
    } catch { /* dup */ }
  }
  log(`  Inserted ${saIns} SAs`);

  // ── 2. Sync energy_resources ──
  log("\n[2/2] Fetching /generators...");
  const erList: unknown[] = await fetchSource("/generators");
  log(`  Got ${erList.length} ERs from API`);

  const existingErIds = new Set((await db.select({ id: energyResources.id }).from(energyResources)).map(e => e.id));
  log(`  Existing ERs in DB: ${existingErIds.size}`);
  const saIds = new Set((await db.select({ id: serviceAreas.id }).from(serviceAreas)).map(s => s.id));
  log(`  SA IDs available: ${saIds.size}`);

  let inserted = 0, skipped = 0, errors = 0;
  log(`  Processing ${erList.length} ERs...`);

  for (let i = 0; i < erList.length; i++) {
    const er = erList[i];
    if (existingErIds.has(er.id)) { skipped++; continue; }
    const saId = er.service_area_id;
    if (saId && !saIds.has(saId)) { skipped++; continue; }
    if (!orgIds.has(er.utility_id)) { skipped++; continue; }

    try {
      await db.insert(energyResources).values({
        id: er.id,
        name: er.name ?? `ER ${er.id}`,
        period_entries: er.period_entries ?? [],
        utility_id: er.utility_id,
        service_area_id: (saId && saIds.has(saId)) ? saId : 1,
        energy_provider_id: mliIds.has(er.energy_provider_id) ? er.energy_provider_id : 20,
        energy_type_id: mliIds.has(er.energy_type_id) ? er.energy_type_id : 1,
        energy_source_id: mliIds.has(er.energy_source_id) ? er.energy_source_id : 41,
        type_id: mliIds.has(er.type_id) ? er.type_id : 1,
        is_virtual: er.is_virtual ?? false,
        strata_id: mliIds.has(er.strata_id) ? er.strata_id : 1,
        updated_at: er.updated_at ? new Date(er.updated_at) : new Date(),
        updated_by_id: null,
      });
      inserted++;
    } catch (e) {
      errors++;
      if (errors === 1) {
        log(`  RAW ERROR: ${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)}`);
        if ((e as { cause?: unknown })?.cause) log(`  CAUSE: ${JSON.stringify((e as { cause?: unknown }).cause, Object.getOwnPropertyNames((e as { cause?: unknown }).cause), 2)}`);
      }
    }

    if ((i + 1) % 100 === 0) log(`  ...${i + 1}/${erList.length} (${inserted} inserted, ${skipped} skipped, ${errors} errors)`);
  }

  log(`\n  Result: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);

  const saCnt = await db.select({ cnt: sql<number>`count(*)` }).from(serviceAreas);
  const erCnt = await db.select({ cnt: sql<number>`count(*)` }).from(energyResources);
  log(`\nDone. service_areas: ${saCnt[0].cnt}, energy_resources: ${erCnt[0].cnt}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
