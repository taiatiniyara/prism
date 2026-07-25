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
  const definitionRows = await db
    .select({
      inputDefId: measureDefinitions.id,
      subcategoryName: sql<
        string | null
      >`(select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.measures_subgroup_id} limit 1)`,
      categoryName: sql<
        string | null
      >`(select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.measures_group_id} limit 1)`,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_system_generated, false),
        sql`lower(coalesce((select mli.name from managed_list_items mli where mli.id = ${measureDefinitions.measures_subgroup_id}), '')) <> 'country context'`,
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

  const allSas = await db
    .select({ id: serviceAreas.id, utility_id: serviceAreas.utility_id })
    .from(serviceAreas)
    .where(
      and(eq(serviceAreas.is_active, true), eq(serviceAreas.is_virtual, false)),
    );
  const saByUtil = new Map<number, number[]>();
  for (const sa of allSas) {
    const arr = saByUtil.get(sa.utility_id) ?? [];
    arr.push(sa.id);
    saByUtil.set(sa.utility_id, arr);
  }

  const allErs = await db
    .select({
      id: energyResources.id,
      utility_id: energyResources.utility_id,
      energy_source_id: energyResources.energy_source_id,
      period_entries: energyResources.period_entries,
    })
    .from(energyResources);

  const irrelevants = await db
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
  const genIrrelevant = new Set(
    irrelevants.map((r) => `${r.inputDefId}:${r.dimensionId}`),
  );

  const allEntries = await db
    .select()
    .from(dataEntries)
    .where(eq(dataEntries.is_deleted, false));

  const utilAcronyms = new Map(
    (
      await db
        .select({ id: organisations.id, a: organisations.acronym })
        .from(organisations)
    ).map((u) => [u.id, u.a ?? `ID${u.id}`]),
  );

  const allRps = await db
    .select({
      id: reportPeriods.id,
      utility_id: reportPeriods.utility_id,
      date: reportPeriods.report_date,
    })
    .from(reportPeriods)
    .orderBy(reportPeriods.utility_id, reportPeriods.report_date);

  let issues = 0;

  for (const rp of allRps) {
    const utilId = rp.utility_id;
    const utilName = utilAcronyms.get(utilId) ?? `?`;
    const rpId = rp.id;
    const saIds = saByUtil.get(utilId) ?? [];

    const periodEntries = allEntries.filter((e) => e.report_period_id === rpId);
    const relevantEntries = periodEntries.filter((e) => e.is_relevant);
    const irrelevantEntries = periodEntries.filter((e) => !e.is_relevant);

    let entered = 0,
      reviewed = 0,
      approved = 0,
      endorsed = 0,
      na = 0;
    for (const e of relevantEntries) {
      if (e.status_id === 3) entered++;
      else if (e.status_id === 4) reviewed++;
      else if (e.status_id === 5) approved++;
      else if (e.status_id === 6) endorsed++;
      else if (e.status_id === 7) na++;
    }

    // Build irrelevant set per SA
    const irrelBySA = new Map<string, Set<number>>();
    for (const e of irrelevantEntries) {
      const k = String(e.service_area_id ?? "null");
      const s = irrelBySA.get(k) ?? new Set<number>();
      s.add(e.measure_def_id);
      irrelBySA.set(k, s);
    }

    // Actual non-gen combos
    const actualNonGenCombos = new Set<string>();
    for (const e of relevantEntries) {
      if (!genIds.includes(e.measure_def_id)) {
        actualNonGenCombos.add(
          `${e.measure_def_id}:${e.service_area_id ?? "null"}`,
        );
      }
    }

    let ngExpected = 0;
    for (const id of nonGenIds) {
      if (scopedIds.has(id)) {
        for (const sa of saIds) {
          const irrel = irrelBySA.get(String(sa)) ?? new Set<number>();
          if (!irrel.has(id)) ngExpected++;
        }
      } else {
        const irrel = irrelBySA.get("null") ?? new Set<number>();
        if (!irrel.has(id)) ngExpected++;
      }
    }

    const periodErs = allErs.filter((er) => {
      if (er.utility_id !== utilId) return false;
      return ((er.period_entries as any[]) ?? []).some(
        (p: any) => p.report_period_id === rpId && p.is_active,
      );
    });

    let gExpected = 0;
    for (const er of periodErs) {
      for (const id of genIds) {
        if (!genIrrelevant.has(`${id}:${er.energy_source_id}`)) gExpected++;
      }
    }

    const requested = ngExpected + gExpected;
    const completed = entered + reviewed + approved + endorsed + na;

    if (completed > requested) {
      issues++;
      if (issues <= 5) {
        console.log(
          `OVER: ${utilName} RP ${rpId} → Req=${requested} Compl=${completed} (${((completed / requested) * 100).toFixed(0)}%) +${completed - requested}`,
        );
      }
    }
  }

  if (issues === 0) {
    console.log("ALL GOOD — no utility has Completed > Requested.");
  } else {
    console.log(`\n${issues} report periods have Completed > Requested.`);
  }

  process.exit(0);
}
main().catch(console.error);
