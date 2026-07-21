import { db } from "@/db/connection";
import {
  dataEntries,
  measureDefinitions,
  inputRelevance,
} from "@/db/schema/dataEntry";
import {
  energyResources,
  serviceAreas,
  organisations,
} from "@/db/schema/utility";
import { sql, eq, and, inArray } from "drizzle-orm";

async function main() {
  // TAU RP 193 (2022)
  const rpId = 193;
  const tauId = 24;
  const tau = await db
    .select({ acronym: organisations.acronym })
    .from(organisations)
    .where(eq(organisations.id, tauId))
    .limit(1);
  console.log(`=== Verifying ${tau[0]?.acronym ?? "TAU"} RP ${rpId} ===\n`);

  // 1. Get definitionRows (matching service.ts line 81-108, after our fix removing is_aggregated)
  const definitionRows = await db
    .select({
      inputDefId: measureDefinitions.id,
      subcategoryName: sql<string | null>`(
        select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.subcategory_id} limit 1
      )`,
      categoryName: sql<string | null>`(
        select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.category_id} limit 1
      )`,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_system_generated, false),
        sql`lower(coalesce(
          (select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.subcategory_id}), ''
        )) <> 'country context'`,
      ),
    );
  console.log(`Definition rows: ${definitionRows.length}`);

  const genIds = definitionRows
    .filter((r) => r.subcategoryName?.trim().toLowerCase() === "generation")
    .map((r) => r.inputDefId);
  const nonGenIds = definitionRows
    .filter((r) => r.subcategoryName?.trim().toLowerCase() !== "generation")
    .map((r) => r.inputDefId);
  console.log(`  Generation defs: ${genIds.length}`);
  console.log(`  Non-generation defs: ${nonGenIds.length}`);

  const scopedIds = new Set(
    definitionRows
      .filter(
        (r) =>
          r.categoryName?.trim().toLowerCase() === "operational" ||
          r.subcategoryName?.trim().toLowerCase() === "tariff structure",
      )
      .map((r) => r.inputDefId),
  );
  console.log(`  Scoped defs (operational/tariff): ${scopedIds.size}`);

  // Debug: show unique category and subcategory names
  const cats = new Set(
    definitionRows
      .map((r) => r.categoryName?.trim().toLowerCase())
      .filter(Boolean),
  );
  const subcats = new Set(
    definitionRows
      .map((r) => r.subcategoryName?.trim().toLowerCase())
      .filter(Boolean),
  );
  console.log(`  Unique categories: ${[...cats].join(", ")}`);
  console.log(`  Unique subcategories: ${[...subcats].join(", ")}`);

  // 2. Service areas for TAU
  const sas = await db
    .select({ id: serviceAreas.id, utility_id: serviceAreas.utility_id })
    .from(serviceAreas)
    .where(
      and(
        eq(serviceAreas.is_active, true),
        eq(serviceAreas.is_virtual, false),
        eq(serviceAreas.utility_id, tauId),
      ),
    );
  const saIds = sas.map((s) => s.id);
  console.log(`\nService areas: ${saIds.length} → [${saIds.join(",")}]`);

  // 3. Energy resources
  const ers = await db
    .select({
      id: energyResources.id,
      utility_id: energyResources.utility_id,
      energy_source_id: energyResources.energy_source_id,
      period_entries: energyResources.period_entries,
    })
    .from(energyResources)
    .where(and(eq(energyResources.is_virtual, false)));
  console.log(`Total non-virtual ERs: ${ers.length}`);

  const periodErs = ers.filter((er) => {
    if (er.utility_id !== tauId) return false;
    const pe = (er.period_entries as unknown[]) ?? [];
    return pe.some((p) => p.report_period_id === rpId && p.is_active);
  });
  console.log(`Active ERs for RP ${rpId}: ${periodErs.length}`);
  for (const er of periodErs.slice(0, 5))
    console.log(`  ER ${er.id} es=${er.energy_source_id}`);

  // 4. Existing entries (is_relevant=true)
  const existingEntries = await db
    .select()
    .from(dataEntries)
    .where(
      and(
        eq(dataEntries.is_deleted, false),
        eq(dataEntries.is_relevant, true),
        inArray(dataEntries.report_period_id, [rpId]),
      ),
    );
  console.log(`\nExisting entries (relevant=true): ${existingEntries.length}`);

  let enteredOnly = 0,
    reviewedOnly = 0,
    approvedOnly = 0,
    notAvail = 0;
  for (const e of existingEntries) {
    if (e.status_id === 3) enteredOnly++;
    else if (e.status_id === 4) reviewedOnly++;
    else if (e.status_id === 5) approvedOnly++;
    else if (e.status_id === 7) notAvail++;
  }
  console.log(
    `  Entered: ${enteredOnly}  Reviewed: ${reviewedOnly}  Approved: ${approvedOnly}  NA: ${notAvail}`,
  );

  // 5. Irrelevant entries (is_relevant=false)
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
        inArray(dataEntries.report_period_id, [rpId]),
      ),
    );
  console.log(`\nIrrelevant entries (relevant=false): ${irrelevantDE.length}`);

  const periodIrrelevantDE = new Map<number | null, Set<number>>();
  irrelevantDE
    .filter((r) => r.reportPeriodId === rpId)
    .forEach((r) => {
      const existing =
        periodIrrelevantDE.get(r.serviceAreaId) ?? new Set<number>();
      existing.add(r.inputDefId);
      periodIrrelevantDE.set(r.serviceAreaId, existing);
    });

  // 6. Calculate nonGenerationExpected
  let nonGenExpected = 0;
  for (const inputDefId of nonGenIds) {
    const isScoped = scopedIds.has(inputDefId);
    const scopeSAs = isScoped ? saIds : [null];
    for (const saId of scopeSAs) {
      const irrelevant = periodIrrelevantDE.get(saId) ?? new Set<number>();
      if (!irrelevant.has(inputDefId)) nonGenExpected++;
    }
  }

  // 7. Calculate generationExpected
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
  console.log(
    `\nIrrelevant input_relevance rows: ${irrelevantInputRel.length}`,
  );

  const periodInputRelIrrelevant = new Set<string>();
  irrelevantInputRel.forEach((r) =>
    periodInputRelIrrelevant.add(`${r.inputDefId}:${r.dimensionId}`),
  );

  let genExpected = 0;
  for (const er of periodErs) {
    for (const inputDefId of genIds) {
      if (periodInputRelIrrelevant.has(`${inputDefId}:${er.energy_source_id}`))
        continue;
      genExpected++;
    }
  }

  const requested = nonGenExpected + genExpected;
  const completed = enteredOnly + reviewedOnly + approvedOnly + notAvail;
  const pending = Math.max(requested - completed, 0);

  console.log(`\n=== CALCULATED ===`);
  console.log(`Non-generation expected: ${nonGenExpected}`);
  console.log(`Generation expected:     ${genExpected}`);
  console.log(`Requested:               ${requested}`);
  console.log(`Entered:                 ${enteredOnly}`);
  console.log(`Reviewed:                ${reviewedOnly}`);
  console.log(`Approved:                ${approvedOnly}`);

  console.log(`Not_Available:           ${notAvail}`);
  console.log(`Completed:               ${completed}`);
  console.log(`Pending:                 ${pending}`);
  console.log(
    `Progress:                ${((completed / requested) * 100).toFixed(0)}% (${completed}/${requested})`,
  );

  process.exit(0);
}
main().catch(console.error);
