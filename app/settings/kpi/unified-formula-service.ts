"use server";

import { db } from "@/db/connection";
import { FormulaInput, measureDefinitions } from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";
import { managedListItems, managedLists } from "@/db/schema/managedLists";
import { measureDimensionScope } from "@/db/schema/measureDimensionScope";
import { measureDimensionApplicability } from "@/db/schema/measureDimensionApplicability";
import {
  formulaBinding,
  formulaBindingDimension,
} from "@/db/schema/formulaBinding";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { analyzeFormula } from "@/lib/formula/arithmetic";
import {
  buildManagedListNameMap,
  resolveManagedListName,
} from "@/lib/managed-list-utils";
import { recomputeKpiNow as engineRecomputeKpiNow } from "@/app/data-entry/kpi-worker/recompute";
import { runAggregatedWorker } from "@/app/data-entry/enter-data/services/aggregated-worker/orchestrator";
import { getCurrentUser } from "@/lib/user.service";
import { reportPeriods } from "@/db/schema/reportPeriods";
import {
  ALL_MEMBER_BY_FIELD,
  BuilderData,
  BuilderMode,
  DIMENSIONS,
  DimensionField,
  MeasureApplicableDim,
  MeasureCatalogueItem,
  MemberOption,
  RecomputeResult,
  SavePayload,
  SaveResult,
  SCOPE_KEY_TO_FIELD,
  TagCardState,
  TargetOption,
} from "@/components/formula-builder/types";

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

export async function getUnifiedFormulaBuilderData(
  mode: BuilderMode,
): Promise<BuilderData> {
  const listItems = await db.select().from(managedListItems);
  const nameById = buildManagedListNameMap(listItems);

  // --- dimension member lists, keyed by physical field ---
  const dimMembers = {} as Record<DimensionField, MemberOption[]>;
  const memberRows = await db
    .select({
      id: managedListItems.id,
      name: managedListItems.name,
      listName: managedLists.name,
    })
    .from(managedListItems)
    .leftJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(eq(managedListItems.is_active, true))
    .orderBy(asc(managedListItems.name));
  for (const d of DIMENSIONS) {
    dimMembers[d.field] = memberRows
      .filter((r) => r.listName === d.listName)
      .map((r) => ({ id: r.id, name: r.name }));
  }

  // --- measure catalogue + per-measure applicable dims ---
  const measureRows = await db
    .select()
    .from(measureDefinitions)
    .where(eq(measureDefinitions.is_active, true))
    .orderBy(asc(measureDefinitions.name));

  const scopeRows = await db.select().from(measureDimensionScope);
  const applicabilityRows = await db
    .select()
    .from(measureDimensionApplicability);

  // group scope + applicability by measure id
  const scopeByMeasure = new Map<number, MeasureApplicableDim[]>();
  const allowedByMeasureDim = new Map<string, number[]>(); // `${measureId}:${field}` -> memberIds
  for (const a of applicabilityRows) {
    const field = SCOPE_KEY_TO_FIELD[a.dimension as string];
    if (!field) continue;
    const key = `${a.measure_id}:${field}`;
    const list = allowedByMeasureDim.get(key) ?? [];
    if (a.member_id != null) list.push(a.member_id);
    allowedByMeasureDim.set(key, list);
  }
  for (const s of scopeRows) {
    if (s.expansion_mode === "not_applicable") continue;
    const field = SCOPE_KEY_TO_FIELD[s.dimension as string];
    if (!field) continue;
    const list = scopeByMeasure.get(s.measure_id) ?? [];
    list.push({
      field,
      expansionMode: s.expansion_mode as "all_members" | "by_context",
      allowedMemberIds:
        s.expansion_mode === "by_context"
          ? allowedByMeasureDim.get(`${s.measure_id}:${field}`)
          : undefined,
    });
    scopeByMeasure.set(s.measure_id, list);
  }

  // Order each measure's applicable dimensions by the canonical PRISM 2 order
  // (DIMENSIONS: provider → category → technology → asset_class → customer_type
  // → payment_mode → consumption_band → division → gender → utility_function),
  // so the tag cards render in a consistent, expected sequence.
  const dimOrder = new Map(DIMENSIONS.map((d, i) => [d.field, i]));
  for (const list of scopeByMeasure.values()) {
    list.sort(
      (a, b) => (dimOrder.get(a.field) ?? 99) - (dimOrder.get(b.field) ?? 99),
    );
  }

  const measures: MeasureCatalogueItem[] = measureRows.map((m) => ({
    id: m.id,
    name: m.name,
    variableName: m.variable_name,
    unitLabel: resolveManagedListName(nameById, m.unit_id, null),
    strataId: m.strata_id ?? null,
    groupName: resolveManagedListName(nameById, m.measures_group_id, null),
    subgroupName: resolveManagedListName(nameById, m.measures_subgroup_id, null),
    dataTypeName: resolveManagedListName(nameById, m.data_type_id, null),
    isCalculated: m.is_calculated ?? false,
    applicableDims: scopeByMeasure.get(m.id) ?? [],
  }));
  const measureById = new Map(measures.map((m) => [m.id, m]));

  // --- targets + rehydrate existing bindings ---
  const bindings = await db
    .select()
    .from(formulaBinding)
    .orderBy(asc(formulaBinding.sort_order));
  const bindingIds = bindings.map((b) => b.id);
  const bindingDims = bindingIds.length
    ? await db
        .select()
        .from(formulaBindingDimension)
        .where(inArray(formulaBindingDimension.binding_id, bindingIds))
    : [];
  const dimsByBinding = new Map<number, typeof bindingDims>();
  for (const bd of bindingDims) {
    const list = dimsByBinding.get(bd.binding_id) ?? [];
    list.push(bd);
    dimsByBinding.set(bd.binding_id, list);
  }
  // keyed "kpi:<id>" / "measure:<id>" — owner id-spaces overlap across tables
  const cardsByOwner = new Map<string, TagCardState[]>();
  for (const b of bindings) {
    const measure = measureById.get(b.input_measure_def_id);
    const dims: TagCardState["dims"] = {};
    for (const bd of dimsByBinding.get(b.id) ?? []) {
      const field = bd.dimension_key as DimensionField;
      if (bd.member_id == null) {
        dims[field] = { mode: "inherit", memberId: null };
      } else if (bd.member_id === ALL_MEMBER_BY_FIELD[field]) {
        dims[field] = { mode: "all", memberId: null };
      } else {
        dims[field] = { mode: "pin", memberId: bd.member_id };
      }
    }
    const ownerKey = `${b.owner_kind}:${b.owner_id}`;
    const list = cardsByOwner.get(ownerKey) ?? [];
    list.push({
      key: `b${b.id}`,
      variableName: b.variable_name,
      measureDefId: b.input_measure_def_id,
      measureName: measure?.name,
      unitLabel: measure?.unitLabel ?? undefined,
      strataId: measure?.strataId ?? null,
      grainMode: b.grain_mode,
      dims,
    });
    cardsByOwner.set(ownerKey, list);
  }

  const kpiRows = await db
    .select({
      id: kpiDefinitions.id,
      name: kpiDefinitions.name,
      formula: kpiDefinitions.formula,
      formula_inputs: kpiDefinitions.formula_inputs,
      is_descriptive: kpiDefinitions.is_descriptive,
      is_currency: kpiDefinitions.is_currency,
      unit_id: kpiDefinitions.unit_id,
    })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.is_active, true))
    .orderBy(asc(kpiDefinitions.name));
  const kpiTargets: TargetOption[] = kpiRows.map((r) => {
    const existingCards =
      cardsByOwner.get(`kpi:${r.id}`) ??
      cardsFromLegacyJson(r.formula_inputs, measureById);
    return {
      id: r.id,
      name: r.name,
      formula: r.formula ?? null,
      hasFormula: !!(r.formula && r.formula.trim()),
      isProperlyConfigured: isTargetConfigured(
        r.formula,
        existingCards,
        measureById,
      ),
      isDescriptive: r.is_descriptive ?? false,
      isTrackedAsKpi: false,
      unitLabel: resolveManagedListName(nameById, r.unit_id, null),
      unitId: r.unit_id ?? null,
      isCurrency: r.is_currency ?? false,
      existingCards,
    };
  });

  // Active KPI names — a calculated measure "is tracked as a KPI" when an
  // active companion KPI of the same name exists (Track-as-KPI pass-through).
  const activeKpiNames = new Set(
    kpiRows.map((r) => r.name.trim().toLowerCase()),
  );

  // Calculated measures = is_calculated measures (e.g. Total Costs, Profit).
  const measureTargetRows = await db
    .select({
      id: measureDefinitions.id,
      name: measureDefinitions.name,
      formula: measureDefinitions.formula,
      formula_inputs: measureDefinitions.formula_inputs,
      is_currency: measureDefinitions.is_currency,
      unit_id: measureDefinitions.unit_id,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        eq(measureDefinitions.is_calculated, true),
      ),
    )
    .orderBy(asc(measureDefinitions.name));
  const measureTargets: TargetOption[] = measureTargetRows.map((r) => {
    const existingCards =
      cardsByOwner.get(`measure:${r.id}`) ??
      cardsFromLegacyJson(r.formula_inputs, measureById);
    return {
      id: r.id,
      name: r.name,
      formula: r.formula ?? null,
      hasFormula: !!(r.formula && r.formula.trim()),
      isProperlyConfigured: isTargetConfigured(
        r.formula,
        existingCards,
        measureById,
      ),
      isDescriptive: false, // calculated measures are numeric by definition
      isTrackedAsKpi: activeKpiNames.has(r.name.trim().toLowerCase()),
      unitLabel: resolveManagedListName(nameById, r.unit_id, null),
      unitId: r.unit_id ?? null,
      isCurrency: r.is_currency ?? false,
      existingCards,
    };
  });

  // UoM options for the inline unit editor. The managed list is named "UoM"
  // (the earlier "Unit"/"Units" guess matched nothing → empty picker); keep the
  // aliases as a fallback in case the list is renamed.
  const units: MemberOption[] = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems)
    .innerJoin(managedLists, eq(managedListItems.list_id, managedLists.id))
    .where(
      and(
        inArray(managedLists.name, [
          "UoM",
          "UOM",
          "uom",
          "Unit",
          "Units",
          "unit",
          "units",
        ]),
        eq(managedListItems.is_active, true),
      ),
    )
    .orderBy(asc(managedListItems.name));

  return { mode, kpiTargets, measureTargets, measures, dimMembers, units };
}

/**
 * Inline UoM editor: set a target's unit_id (kpi_definitions for KPIs,
 * measure_definitions for calculated measures). Display-only metadata — no
 * recompute needed; the harness/dashboards format off it.
 */
export async function updateTargetUom(input: {
  mode: BuilderMode;
  ownerId: number;
  unitId: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (input.mode === "kpi") {
      await db
        .update(kpiDefinitions)
        .set({ unit_id: input.unitId })
        .where(eq(kpiDefinitions.id, input.ownerId));
    } else {
      await db
        .update(measureDefinitions)
        .set({ unit_id: input.unitId })
        .where(eq(measureDefinitions.id, input.ownerId));
    }
    revalidatePath("/settings/kpi");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update unit.",
    };
  }
}

function cardsFromLegacyJson(
  inputs: FormulaInput[] | null | undefined,
  measureById: Map<number, MeasureCatalogueItem>,
): TagCardState[] {
  if (!Array.isArray(inputs)) return [];
  return inputs.map((fi, idx) => {
    const measure = measureById.get(fi.measure_def_id);
    const dims: TagCardState["dims"] = {};
    for (const d of measure?.applicableDims ?? []) {
      const raw = (fi as unknown as Record<string, number | null | undefined>)[
        d.field
      ];
      if (raw == null) dims[d.field] = { mode: "inherit", memberId: null };
      else if (raw === ALL_MEMBER_BY_FIELD[d.field])
        dims[d.field] = { mode: "all", memberId: null };
      else dims[d.field] = { mode: "pin", memberId: raw };
    }
    return {
      key: `j${idx}`,
      variableName: fi.variable_name,
      measureDefId: fi.measure_def_id,
      measureName: measure?.name,
      unitLabel: measure?.unitLabel ?? undefined,
      strataId: measure?.strataId ?? null,
      grainMode: "inherit" as const,
      dims,
    };
  });
}

/**
 * A target has a WORKING, properly-configured formula when: it has a formula
 * string, every variable in that formula is bound to an input card, and every
 * bound card resolves to a CURRENT active measure. Returns false for empty
 * formulas AND for broken ones — e.g. the legacy KPIs whose formula_inputs
 * still point at pre-migration measure ids that no longer exist (dangling
 * bindings needing repair / repointing). Used by the "needs setup or repair"
 * filter so those broken targets surface alongside the formula-less ones.
 */
function isTargetConfigured(
  formula: string | null | undefined,
  cards: TagCardState[],
  measureById: Map<number, MeasureCatalogueItem>,
): boolean {
  const trimmed = (formula ?? "").trim();
  if (!trimmed) return false;

  const formulaVars = new Set(analyzeFormula(trimmed).variables);
  const cardVars = new Set(cards.map((c) => c.variableName));
  for (const variable of formulaVars) {
    if (!cardVars.has(variable)) return false; // a formula variable with no binding
  }
  for (const card of cards) {
    if (card.measureDefId == null || !measureById.has(card.measureDefId)) {
      return false; // dangling / unresolvable input measure
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Save (formula_binding = source of truth + derived formula_inputs JSON cache)
// ---------------------------------------------------------------------------

export async function saveUnifiedFormula(
  payload: SavePayload,
): Promise<SaveResult> {
  const formula = payload.formula.trim();
  if (!payload.ownerId || Number.isNaN(payload.ownerId))
    return { ok: false, error: "Choose a KPI/measure first." };
  if (!formula) return { ok: false, error: "Formula is required." };
  if (!payload.cards.length)
    return { ok: false, error: "Add at least one input." };

  // validation
  const seen = new Set<number>();
  for (const c of payload.cards) {
    if (!c.measureDefId)
      return { ok: false, error: `Pick a measure for "${c.variableName}".` };
    if (c.measureDefId === payload.ownerId)
      return { ok: false, error: "An input cannot reference the formula itself." };
    if (seen.has(c.measureDefId)) {
      // duplicate input measure is allowed only if sliced differently; keep simple: warn-not-block
    }
    seen.add(c.measureDefId);
    if (!c.variableName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.variableName))
      return { ok: false, error: `Invalid variable name "${c.variableName}".` };
  }

  const ownerKind = payload.mode === "kpi" ? "kpi" : "measure";

  // derived FormulaInput[] with ALL 10 dims explicit
  const formulaInputs: FormulaInput[] = payload.cards.map((c) => {
    const fi: FormulaInput = {
      measure_def_id: c.measureDefId as number,
      variable_name: c.variableName,
    };
    for (const d of DIMENSIONS) {
      const binding = c.dims[d.field];
      let memberId = d.allMember;
      if (binding && binding.mode === "pin" && binding.memberId != null)
        memberId = binding.memberId;
      (fi as unknown as Record<string, number>)[d.field] = memberId;
    }
    return fi;
  });

  try {
    await db.transaction(async (tx) => {
      // wipe prior bindings for this owner (cascade drops dimensions)
      await tx
        .delete(formulaBinding)
        .where(
          and(
            eq(formulaBinding.owner_kind, ownerKind),
            eq(formulaBinding.owner_id, payload.ownerId),
          ),
        );

      for (let i = 0; i < payload.cards.length; i++) {
        const c = payload.cards[i];
        const inserted = await tx
          .insert(formulaBinding)
          .values({
            owner_kind: ownerKind,
            owner_id: payload.ownerId,
            variable_name: c.variableName,
            input_measure_def_id: c.measureDefId as number,
            grain_mode: c.grainMode ?? "inherit",
            sort_order: i,
          })
          .returning({ id: formulaBinding.id });
        const bindingId = inserted[0].id;

        const dimRows = Object.entries(c.dims)
          .map(([field, b]) => {
            if (!b) return null;
            let memberId: number | null;
            if (b.mode === "pin") memberId = b.memberId;
            else if (b.mode === "all")
              memberId = ALL_MEMBER_BY_FIELD[field as DimensionField];
            else memberId = null; // inherit
            return { binding_id: bindingId, dimension_key: field, member_id: memberId };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (dimRows.length)
          await tx.insert(formulaBindingDimension).values(dimRows);
      }

      if (ownerKind === "kpi") {
        await tx
          .update(kpiDefinitions)
          .set({ formula, formula_inputs: formulaInputs })
          .where(eq(kpiDefinitions.id, payload.ownerId));
      } else {
        await tx
          .update(measureDefinitions)
          .set({
            formula,
            formula_inputs: formulaInputs,
            is_calculated: true,
          })
          .where(eq(measureDefinitions.id, payload.ownerId));

        // Track as KPI: publish this calculated measure as a companion KPI
        // that references it by a single-variable pass-through ("compute once,
        // reference many" — the measure computes; the KPI publishes its value).
        // Linked by name; created/reactivated when on, deactivated when off.
        const [measureRow] = await tx
          .select({
            name: measureDefinitions.name,
            variableName: measureDefinitions.variable_name,
            isCurrency: measureDefinitions.is_currency,
          })
          .from(measureDefinitions)
          .where(eq(measureDefinitions.id, payload.ownerId))
          .limit(1);

        if (measureRow) {
          const [companion] = await tx
            .select({ id: kpiDefinitions.id })
            .from(kpiDefinitions)
            .where(eq(kpiDefinitions.name, measureRow.name))
            .limit(1);

          if (!payload.trackAsKpi) {
            if (companion) {
              await tx
                .update(kpiDefinitions)
                .set({ is_active: false })
                .where(eq(kpiDefinitions.id, companion.id));
            }
          } else {
            const passVar = /^[A-Za-z_][A-Za-z0-9_]*$/.test(
              measureRow.variableName ?? "",
            )
              ? (measureRow.variableName as string)
              : `source_measure_${payload.ownerId}`;
            const passFormula = passVar;
            const passInputs: FormulaInput[] = [
              (() => {
                const fi: FormulaInput = {
                  measure_def_id: payload.ownerId,
                  variable_name: passVar,
                };
                for (const d of DIMENSIONS) {
                  (fi as unknown as Record<string, number>)[d.field] =
                    d.allMember;
                }
                return fi;
              })(),
            ];

            let companionId: number;
            if (companion) {
              await tx
                .update(kpiDefinitions)
                .set({
                  formula: passFormula,
                  formula_inputs: passInputs,
                  is_currency: measureRow.isCurrency,
                  is_active: true,
                })
                .where(eq(kpiDefinitions.id, companion.id));
              companionId = companion.id;
            } else {
              const insertedKpi = await tx
                .insert(kpiDefinitions)
                .values({
                  name: measureRow.name,
                  formula: passFormula,
                  formula_inputs: passInputs,
                  is_currency: measureRow.isCurrency,
                })
                .returning({ id: kpiDefinitions.id });
              companionId = insertedKpi[0].id;
            }

            // Rewrite the companion KPI's formula_binding (one pass-through
            // input = the measure, every dimension All-member).
            await tx
              .delete(formulaBinding)
              .where(
                and(
                  eq(formulaBinding.owner_kind, "kpi"),
                  eq(formulaBinding.owner_id, companionId),
                ),
              );
            const [insertedBinding] = await tx
              .insert(formulaBinding)
              .values({
                owner_kind: "kpi",
                owner_id: companionId,
                variable_name: passVar,
                input_measure_def_id: payload.ownerId,
                grain_mode: "inherit",
                sort_order: 0,
              })
              .returning({ id: formulaBinding.id });
            await tx.insert(formulaBindingDimension).values(
              DIMENSIONS.map((d) => ({
                binding_id: insertedBinding.id,
                dimension_key: d.field,
                member_id: ALL_MEMBER_BY_FIELD[d.field],
              })),
            );
          }
        }
      }
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Save failed.",
    };
  }

  revalidatePath("/settings/kpi");
  revalidatePath("/settings/inputs");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Compute now
// ---------------------------------------------------------------------------

/** measure_def_ids a KPI/measure formula_inputs cache references (both keys). */
function inputMeasureIds(
  formulaInputs: FormulaInput[] | null | undefined,
): number[] {
  return (formulaInputs ?? [])
    .map((fi) => {
      const raw = fi as FormulaInput & {
        measure_def_id?: unknown;
        input_def_id?: unknown;
      };
      const id = raw.measure_def_id ?? raw.input_def_id;
      return typeof id === "number" ? id : null;
    })
    .filter((id): id is number => id != null);
}

async function allReportPeriodIds(explicit?: number[]): Promise<number[]> {
  if (explicit && explicit.length) return explicit;
  const rows = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .orderBy(asc(reportPeriods.id));
  return rows.map((r) => r.id);
}

/** Compute just the calculated-measure VALUES (aggregated worker per period);
 *  no downstream KPI publish — callers add that when they want end-to-end. */
async function computeCalculatedMeasureValues(
  periodIds: number[],
): Promise<{ calculated: number; skipped: number; errors: number }> {
  const user = await getCurrentUser();
  let calculated = 0;
  let skipped = 0;
  let errors = 0;
  for (const reportPeriodId of periodIds) {
    try {
      const { outcomes } = await runAggregatedWorker(user, { reportPeriodId });
      for (const o of outcomes) {
        if (o.status === "calculated") calculated += 1;
        else skipped += 1;
      }
    } catch {
      errors += 1;
    }
  }
  return { calculated, skipped, errors };
}

export async function recomputeKpiNow(
  kpiDefId: number,
): Promise<RecomputeResult> {
  // Self-sufficient standalone compute: if this KPI references any COMPUTED
  // (is_calculated) measure, refresh those measures first so the KPI reads
  // fresh upstream values — no "compute the measures first" ordering needed.
  const [kpi] = await db
    .select({ formula_inputs: kpiDefinitions.formula_inputs })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.id, kpiDefId))
    .limit(1);
  const inputIds = inputMeasureIds(kpi?.formula_inputs);
  if (inputIds.length) {
    const computedInputs = await db
      .select({ id: measureDefinitions.id })
      .from(measureDefinitions)
      .where(
        and(
          inArray(measureDefinitions.id, inputIds),
          eq(measureDefinitions.is_calculated, true),
        ),
      );
    if (computedInputs.length) {
      // Refresh the upstream measure VALUES only — not the whole dependent-KPI
      // fan-out (that belongs to the calculated-measures button).
      await computeCalculatedMeasureValues(await allReportPeriodIds());
    }
  }
  return engineRecomputeKpiNow({ kpiDefIds: [kpiDefId] });
}

export async function recomputeAllKpis(): Promise<RecomputeResult> {
  return engineRecomputeKpiNow({ all: true });
}

/**
 * Compute calculated MEASURES (is_calculated=true). Reuses the existing
 * aggregated-worker (fixpoint over all calculated-measure formulas, writing
 * derived values into data_entries), run once per report period at utility
 * scope. The builder's saved formula_inputs cache is what the worker reads.
 */
export async function recomputeCalculatedMeasuresNow(
  reportPeriodIds?: number[],
): Promise<{
  periods: number;
  calculated: number;
  skipped: number;
  errors: number;
}> {
  const periodIds = await allReportPeriodIds(reportPeriodIds);
  const { calculated, skipped, errors } =
    await computeCalculatedMeasureValues(periodIds);

  // Publish downstream KPIs end-to-end: the aggregated worker's own KPI trigger
  // runs at the caller's org scope only, so recompute every KPI that references
  // a calculated measure per-utility here (companion pass-through KPIs from
  // Track-as-KPI + real KPIs like Cost-per-Customer). engineRecomputeKpiNow
  // iterates report periods, which are utility-specific.
  try {
    const calcMeasures = await db
      .select({ id: measureDefinitions.id })
      .from(measureDefinitions)
      .where(eq(measureDefinitions.is_calculated, true));
    const calcIds = new Set(calcMeasures.map((m) => m.id));
    if (calcIds.size) {
      const activeKpis = await db
        .select({
          id: kpiDefinitions.id,
          formula_inputs: kpiDefinitions.formula_inputs,
        })
        .from(kpiDefinitions)
        .where(eq(kpiDefinitions.is_active, true));
      const dependentKpiIds = activeKpis
        .filter((k) =>
          inputMeasureIds(k.formula_inputs).some((id) => calcIds.has(id)),
        )
        .map((k) => k.id);
      if (dependentKpiIds.length) {
        await engineRecomputeKpiNow({
          kpiDefIds: dependentKpiIds,
          reportPeriodIds: periodIds,
        });
      }
    }
  } catch {
    // Downstream KPI publish is best-effort; the measure values are already
    // written. Surface nothing extra — the KPI compute has its own reporting.
  }

  revalidatePath("/settings/inputs");
  revalidatePath("/settings/kpi");
  return { periods: periodIds.length, calculated, skipped, errors };
}
