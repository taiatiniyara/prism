import { db } from "@/db/connection";
import {
  dataEntries,
  measureDefinitions,
  type FormulaInput,
} from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import {
  energyResources,
  serviceAreas,
  organisations,
} from "@/db/schema/utility";
import { sql, eq, and, inArray } from "drizzle-orm";

const DL_SUBCAT_GENERATION = 273;

async function main() {
  // Check ASPA
  const aspa = (
    await db
      .select({ id: organisations.id, acronym: organisations.acronym })
      .from(organisations)
      .where(eq(organisations.acronym, "ASPA"))
      .limit(1)
  )[0];
  if (!aspa) {
    console.log("ASPA not found");
    process.exit(1);
  }
  console.log(`=== ${aspa.acronym} id=${aspa.id} ===\n`);

  const rps = await db
    .select({ id: reportPeriods.id, date: reportPeriods.report_date })
    .from(reportPeriods)
    .where(eq(reportPeriods.utility_id, aspa.id))
    .orderBy(reportPeriods.report_date);

  // Definition rows (matching new service.ts)
  const defRows = await db
    .select({
      inputDefId: measureDefinitions.id,
      name: measureDefinitions.name,
      subcategoryId: measureDefinitions.subcategory_id,
      categoryId: measureDefinitions.category_id,
      aggLevelId: measureDefinitions.agg_level_id,
      formulaInputs: measureDefinitions.formula_inputs,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_system_generated, false),
        eq(measureDefinitions.is_aggregated, false),
        sql`lower(coalesce((select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.subcategory_id}), '')) <> 'country context'`,
      ),
    );

  console.log(`Definition rows: ${defRows.length}`);

  const sas = await db
    .select({ id: serviceAreas.id })
    .from(serviceAreas)
    .where(
      and(
        eq(serviceAreas.is_active, true),
        eq(serviceAreas.is_virtual, false),
        eq(serviceAreas.utility_id, aspa.id),
      ),
    );
  const saIds = sas.map((s) => s.id);
  console.log(`SAs: ${saIds.length} → [${saIds.join(",")}]`);

  const allErs = await db
    .select({
      id: energyResources.id,
      utility_id: energyResources.utility_id,
      service_area_id: energyResources.service_area_id,
      energy_provider_id: energyResources.energy_provider_id,
      energy_source_id: energyResources.energy_source_id,
      is_virtual: energyResources.is_virtual,
      period_entries: energyResources.period_entries,
    })
    .from(energyResources);

  const allEntries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
        inArray(
          dataEntries.report_period_id,
          rps.map((r) => r.id),
        ),
      ),
    );

  const irrelDE = await db
    .select({
      rpId: dataEntries.report_period_id,
      inputDefId: dataEntries.measure_def_id,
      saId: dataEntries.service_area_id,
    })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, false),
        inArray(
          dataEntries.report_period_id,
          rps.map((r) => r.id),
        ),
      ),
    );

  for (const rp of rps) {
    const rpId = rp.id;
    const periodEntries = allEntries.filter((e) => e.report_period_id === rpId);

    let entered = 0,
      reviewed = 0,
      approved = 0,
      endorsed = 0,
      na = 0;
    for (const e of periodEntries) {
      if (e.status_id === 3) entered++;
      else if (e.status_id === 4) reviewed++;
      else if (e.status_id === 5) approved++;
      else if (e.status_id === 6) endorsed++;
      else if (e.status_id === 7) na++;
    }

    // Irrelevant map
    const irrelBySA = new Map<string, Set<number>>();
    for (const r of irrelDE) {
      if (r.rpId !== rpId) continue;
      const k = String(r.saId ?? "null");
      const s = irrelBySA.get(k) ?? new Set<number>();
      s.add(r.inputDefId);
      irrelBySA.set(k, s);
    }

    // Active generators for period
    const periodGens = allErs.filter((er) => {
      if (er.utility_id !== aspa.id) return false;
      if (er.is_virtual) return false; // prism-training: non-virtual only
      return ((er.period_entries as any[]) ?? []).some(
        (p: any) => p.report_period_id === rpId && p.is_active,
      );
    });

    // Requested calculation (prism-training style)
    let requested = 0;
    for (const def of defRows) {
      const irrelNull = irrelBySA.get("null") ?? new Set<number>();
      if (irrelNull.has(def.inputDefId)) continue;

      const isGen = def.subcategoryId === DL_SUBCAT_GENERATION;
      const formulaInputs =
        (def.formulaInputs as FormulaInput[] | undefined) ?? [];
      const aggLevel = def.aggLevelId ?? 1;

      if (isGen) {
        const epId = formulaInputs[0]?.energy_provider_id ?? null;
        const esId = formulaInputs[0]?.energy_source_id ?? null;
        if (epId != null || esId != null) {
          const matchingGens = periodGens.filter((g) => {
            if (epId != null && g.energy_provider_id !== epId) return false;
            if (esId != null && g.energy_source_id !== esId) return false;
            return true;
          });
          for (const gen of matchingGens) {
            if (gen.service_area_id && saIds.includes(gen.service_area_id)) {
              const irrelSA =
                irrelBySA.get(String(gen.service_area_id)) ?? new Set<number>();
              if (!irrelSA.has(def.inputDefId)) requested++;
            }
          }
        } else {
          for (const gen of periodGens) {
            if (gen.service_area_id && saIds.includes(gen.service_area_id)) {
              const irrelSA =
                irrelBySA.get(String(gen.service_area_id)) ?? new Set<number>();
              if (!irrelSA.has(def.inputDefId)) requested++;
            }
          }
        }
      } else if (def.categoryId === 205 && aggLevel === 3) {
        // Operational at agg_level 3: count per SA
        for (const saId of saIds) {
          const irrelSA = irrelBySA.get(String(saId)) ?? new Set<number>();
          if (!irrelSA.has(def.inputDefId)) requested++;
        }
      } else {
        requested++;
      }
    }

    const completed = entered + reviewed + approved + endorsed + na;
    const pending = Math.max(requested - completed, 0);
    console.log(
      `RP ${rpId} (${rp.date.toISOString().split("T")[0]}): Req=${requested} Pnd=${pending} Ent=${entered} Rev=${reviewed} End=${endorsed} Compl=${completed} (${((completed / requested) * 100).toFixed(0)}%) gens=${periodGens.length}`,
    );
  }

  process.exit(0);
}
main().catch(console.error);
