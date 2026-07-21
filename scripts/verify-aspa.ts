import { db } from "@/db/connection";
import {
  dataEntries,
  measureDefinitions,
  inputRelevance,
} from "@/db/schema/dataEntry";
import { reportPeriods } from "@/db/schema/reportPeriods";
import {
  energyResources,
  serviceAreas,
  organisations,
} from "@/db/schema/utility";
import { sql, eq, and, inArray } from "drizzle-orm";

async function main() {
  // Find ASPA
  const aspa = await db
    .select({
      id: organisations.id,
      acronym: organisations.acronym,
      name: organisations.name,
    })
    .from(organisations)
    .where(eq(organisations.acronym, "ASPA"))
    .limit(1);
  if (!aspa[0]) {
    console.log("ASPA not found");
    process.exit(1);
  }
  const utilId = aspa[0].id;
  console.log(`=== ${aspa[0].acronym} (${aspa[0].name}) id=${utilId} ===\n`);

  const rps = await db
    .select({
      id: reportPeriods.id,
      date: reportPeriods.report_date,
      type: reportPeriods.report_type_id,
    })
    .from(reportPeriods)
    .where(eq(reportPeriods.utility_id, utilId))
    .orderBy(reportPeriods.report_date);
  console.log(`Report periods: ${rps.length}`);
  for (const r of rps)
    console.log(
      `  ${r.id}: ${r.date.toISOString().split("T")[0]} type=${r.type}`,
    );

  const rpIds = rps.map((r) => r.id);

  // Load definition rows (matching fixed service.ts)
  const definitionRows = await db
    .select({
      inputDefId: measureDefinitions.id,
      name: measureDefinitions.name,
      subcategoryName: sql<
        string | null
      >`(select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.subcategory_id} limit 1)`,
      categoryName: sql<
        string | null
      >`(select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.category_id} limit 1)`,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_system_generated, false),
        sql`lower(coalesce((select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.subcategory_id}), '')) <> 'country context'`,
      ),
    );

  const genIds = definitionRows
    .filter((r) => r.subcategoryName?.trim().toLowerCase() === "generation")
    .map((r) => r.inputDefId);
  const nonGenIds = definitionRows
    .filter((r) => r.subcategoryName?.trim().toLowerCase() !== "generation")
    .map((r) => r.inputDefId);
  const scopedIds = new Set(
    definitionRows
      .filter(
        (r) =>
          r.categoryName?.trim().toLowerCase() === "operational" ||
          r.subcategoryName?.trim().toLowerCase() === "tariff structure",
      )
      .map((r) => r.inputDefId),
  );

  const sas = await db
    .select({ id: serviceAreas.id })
    .from(serviceAreas)
    .where(
      and(
        eq(serviceAreas.is_active, true),
        eq(serviceAreas.is_virtual, false),
        eq(serviceAreas.utility_id, utilId),
      ),
    );
  const saIds = sas.map((s) => s.id);

  const allErs = await db
    .select({
      id: energyResources.id,
      utility_id: energyResources.utility_id,
      energy_source_id: energyResources.energy_source_id,
      period_entries: energyResources.period_entries,
    })
    .from(energyResources);

  const existingEntries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
        inArray(dataEntries.report_period_id, rpIds),
      ),
    );

  const irrelevantDE = await db
    .select({
      reportPeriodId: dataEntries.report_period_id,
      inputDefId: dataEntries.measure_def_id,
      serviceAreaId: dataEntries.service_area_id,
    })
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, false),
        inArray(dataEntries.report_period_id, rpIds),
      ),
    );

  const periodIrrelevantDE = new Map<string, Set<number>>();
  irrelevantDE.forEach((r) => {
    const key = `${r.reportPeriodId}:${String(r.serviceAreaId)}`;
    const existing = periodIrrelevantDE.get(key) ?? new Set<number>();
    existing.add(r.inputDefId);
    periodIrrelevantDE.set(key, existing);
  });

  const irrelevantInputRel = await db
    .select({
      inputDefId: inputRelevance.measure_def_id,
      dimensionId: inputRelevance.dimension_id,
    })
    .from(inputRelevance)
    .where(
      and(
        eq(inputRelevance.is_relevant, false),
        inArray(
          inputRelevance.measure_def_id,
          genIds.length > 0 ? genIds : [-1],
        ),
      ),
    );
  const periodInputRelIrrelevant = new Set(
    irrelevantInputRel.map((r) => `${r.inputDefId}:${r.dimensionId}`),
  );

  console.log(
    `\nSetup: ${definitionRows.length} defs (${genIds.length} gen, ${nonGenIds.length} non-gen, ${scopedIds.size} scoped)`,
  );
  console.log(`  ${saIds.length} SAs, ${allErs.length} total ERs`);
  console.log(
    `  ${existingEntries.length} relevant entries across ${rpIds.length} periods`,
  );
  console.log(`  ${irrelevantDE.length} irrelevant entries`);
  console.log(
    `  ${irrelevantInputRel.length} irrelevant input_relevance rows\n`,
  );

  for (const rp of rps) {
    const rpId = rp.id;
    const entriesForPeriod = existingEntries.filter(
      (e) => e.report_period_id === rpId,
    );

    let entered = 0,
      reviewed = 0,
      approved = 0,
      endorsed = 0,
      na = 0;
    for (const e of entriesForPeriod) {
      if (e.status_id === 3) entered++;
      else if (e.status_id === 4) reviewed++;
      else if (e.status_id === 5) approved++;
      else if (e.status_id === 6) endorsed++;
      else if (e.status_id === 7) na++;
    }

    const rpIrrelevantDE = new Map<string, Set<number>>();
    irrelevantDE
      .filter((r) => r.reportPeriodId === rpId)
      .forEach((r) => {
        const key = String(r.serviceAreaId);
        const existing = rpIrrelevantDE.get(key) ?? new Set<number>();
        existing.add(r.inputDefId);
        rpIrrelevantDE.set(key, existing);
      });

    // Build set of actual (def, SA) combos for non-gen entries
    const actualNonGenSACombos = new Set<string>();
    for (const e of entriesForPeriod) {
      if (!genIds.includes(e.measure_def_id)) {
        actualNonGenSACombos.add(
          `${e.measure_def_id}:${String(e.service_area_id)}`,
        );
      }
    }

    let nonGenExpected = 0;
    for (const inputDefId of nonGenIds) {
      const isScoped = scopedIds.has(inputDefId);
      if (isScoped) {
        for (const saId of saIds) {
          const key = String(saId);
          const irrelevant = rpIrrelevantDE.get(key) ?? new Set<number>();
          if (!irrelevant.has(inputDefId)) nonGenExpected++;
        }
      } else {
        // For unscoped defs, count per SA only if entries actually exist for that (def, SA)
        // Also count once for null SA entries
        if (actualNonGenSACombos.has(`${inputDefId}:null`)) nonGenExpected++;
        for (const saId of saIds) {
          if (actualNonGenSACombos.has(`${inputDefId}:${String(saId)}`)) {
            nonGenExpected++;
          }
        }
      }
    }

    const periodErs = allErs.filter((er) => {
      if (er.utility_id !== utilId) return false;
      const pe = (er.period_entries as any[]) ?? [];
      return pe.some((p) => p.report_period_id === rpId && p.is_active);
    });

    let genExpected = 0;
    for (const er of periodErs) {
      for (const inputDefId of genIds) {
        if (
          periodInputRelIrrelevant.has(`${inputDefId}:${er.energy_source_id}`)
        )
          continue;
        genExpected++;
      }
    }

    const requested = nonGenExpected + genExpected;
    const completed = entered + reviewed + approved + endorsed + na;
    const pending = Math.max(requested - completed, 0);

    console.log(
      `RP ${rpId} (${rp.date.toISOString().split("T")[0]}): Req=${requested} Pnd=${pending} Ent=${entered} Rev=${reviewed} App=${approved} End=${endorsed} NA=${na} Compl=${completed} (${((completed / requested) * 100).toFixed(0)}%) ng=${nonGenExpected} g=${genExpected} ERs=${periodErs.length}`,
    );
  }

  process.exit(0);
}
main().catch(console.error);
