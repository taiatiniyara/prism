import { and, asc, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/connection";
import {
  type BscThemeStyles,
  bscInitiatives,
  bscKpiLinks,
  bscKpiTargetPlan,
  bscSpecificObjectives,
  bscTemplateLinks,
  bscTemplateNodes,
  bscTheme,
  bscUtilityNodes,
} from "@/db/schema/bsc-builder";
import { kpiDefinitions } from "@/db/schema/kpi";
import { measureDefinitions } from "@/db/schema/dataEntry";
import { managedListItems, managedLists } from "@/db/schema/managedLists";

import type {
  CreateTemplateNodePayload,
  KpiOption,
  InputOption,
  KpiTargetRow,
  ReportTypeOption,
  TargetPlanInput,
  TargetPlanSummary,
  OverlayNodeInput,
  ScorecardInitiative,
  ScorecardNode,
  ScorecardResponse,
  ScorecardSpecificObjective,
  SavePerspectiveOverlayPayload,
  TemplateNode,
  UpdateTemplateNodePayload,
} from "./types";

// ---------------------------------------------------------------------------
// Theme (single global row)
// ---------------------------------------------------------------------------

const GLOBAL_THEME_SCOPE = "global";

export const getThemeStyles = async (): Promise<BscThemeStyles> => {
  const [row] = await db
    .select({ styles: bscTheme.styles })
    .from(bscTheme)
    .where(eq(bscTheme.scope, GLOBAL_THEME_SCOPE))
    .limit(1);
  return row?.styles ?? {};
};

export const saveThemeStyles = async (
  userId: string,
  styles: BscThemeStyles,
): Promise<void> => {
  await db
    .insert(bscTheme)
    .values({ scope: GLOBAL_THEME_SCOPE, styles, updated_by_id: userId })
    .onConflictDoUpdate({
      target: bscTheme.scope,
      set: { styles, updated_by_id: userId, updated_at: new Date() },
    });
};

// ---------------------------------------------------------------------------
// Master template
// ---------------------------------------------------------------------------

export const listTemplateTree = async (): Promise<TemplateNode[]> => {
  const rows = await db
    .select()
    .from(bscTemplateNodes)
    .where(eq(bscTemplateNodes.is_active, true))
    .orderBy(asc(bscTemplateNodes.ord));

  let links: { source: string; target: string }[] = [];
  try {
    links = await db
      .select({
        source: bscTemplateLinks.source_node_id,
        target: bscTemplateLinks.target_node_id,
      })
      .from(bscTemplateLinks)
      .orderBy(asc(bscTemplateLinks.ord));
  } catch {
  }

  const targetsBySource = new Map<string, string[]>();
  for (const l of links) {
    const list = targetsBySource.get(l.source) ?? [];
    list.push(l.target);
    targetsBySource.set(l.source, list);
  }

  const byId = new Map<string, TemplateNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      level: row.level,
      label: row.label,
      isMandatory: row.is_mandatory,
      isMapNode: row.is_map_node,
      linkTargets: targetsBySource.get(row.id) ?? [],
      ord: row.ord,
      children: [],
    });
  }

  const roots: TemplateNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (nodes: TemplateNode[]) => {
    nodes.sort((a, b) => a.ord - b.ord);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
};

export const createTemplateNode = async (
  payload: CreateTemplateNodePayload,
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(bscTemplateNodes)
    .values({
      parent_id: payload.parentId,
      level: payload.level,
      label: payload.label,
      is_mandatory: payload.isMandatory,
      ord: payload.ord,
    })
    .returning({ id: bscTemplateNodes.id });
  return row;
};

export const updateTemplateNode = async (
  id: string,
  payload: UpdateTemplateNodePayload,
): Promise<void> => {
  await db
    .update(bscTemplateNodes)
    .set({
      ...(payload.label !== undefined ? { label: payload.label } : {}),
      ...(payload.isMandatory !== undefined
        ? { is_mandatory: payload.isMandatory }
        : {}),
      ...(payload.isMapNode !== undefined
        ? { is_map_node: payload.isMapNode }
        : {}),
      ...(payload.ord !== undefined ? { ord: payload.ord } : {}),
      ...(payload.isActive !== undefined ? { is_active: payload.isActive } : {}),
      updated_at: new Date(),
    })
    .where(eq(bscTemplateNodes.id, id));
};

export const deleteTemplateNode = async (id: string): Promise<void> => {
  await db.delete(bscTemplateNodes).where(eq(bscTemplateNodes.id, id));
};

// Replace the full set of master links FROM `sourceId`. Self-links are dropped;
// duplicates collapse via the unique (source,target) index. Idempotent.
export const setTemplateNodeLinks = async (
  sourceId: string,
  targetIds: string[],
): Promise<void> => {
  const targets = [...new Set(targetIds)].filter((t) => t && t !== sourceId);
  await db.transaction(async (tx) => {
    await tx
      .delete(bscTemplateLinks)
      .where(eq(bscTemplateLinks.source_node_id, sourceId));
    if (targets.length > 0) {
      await tx.insert(bscTemplateLinks).values(
        targets.map((target, idx) => ({
          source_node_id: sourceId,
          target_node_id: target,
          ord: idx,
        })),
      );
    }
  });
};

// ---------------------------------------------------------------------------
// Tracking-frequency options (the "Report Type" managed list)
// ---------------------------------------------------------------------------

export const listReportTypeOptions = async (): Promise<ReportTypeOption[]> => {
  const [list] = await db
    .select({ id: managedLists.id })
    .from(managedLists)
    .where(eq(managedLists.name, "Report Type"))
    .limit(1);
  if (!list) return [];

  const rows = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems)
    .where(
      and(
        eq(managedListItems.list_id, list.id),
        eq(managedListItems.is_active, true),
      ),
    )
    .orderBy(asc(managedListItems.id));

  return rows;
};

// ---------------------------------------------------------------------------
// KPI picker options (active + visible to the utility; report-period agnostic)
// ---------------------------------------------------------------------------

export const listBuilderKpiOptions = async (
  utilityId: number,
): Promise<KpiOption[]> => {
  const unit = alias(managedListItems, "kpi_unit");
  const category = alias(managedListItems, "kpi_category");
  const subcategory = alias(managedListItems, "kpi_subcategory");
  const rows = await db
    .select({
      kpiDefinitionId: kpiDefinitions.id,
      name: kpiDefinitions.name,
      unit: unit.name,
      category: category.name,
      subcategory: subcategory.name,
    })
    .from(kpiDefinitions)
    .leftJoin(unit, eq(kpiDefinitions.unit_id, unit.id))
    .leftJoin(category, eq(kpiDefinitions.category_id, category.id))
    .leftJoin(subcategory, eq(kpiDefinitions.subcategory_id, subcategory.id))
    .where(
      and(
        eq(kpiDefinitions.is_active, true),
        or(
          eq(kpiDefinitions.is_private, false),
          eq(kpiDefinitions.owner_utility_id, utilityId),
        ),
      ),
    )
    .orderBy(asc(kpiDefinitions.name));

  return rows;
};

// Input picker options — sourced from the Input definitions table (its own
// categories/subcategories/data types, distinct from the KPI table's values).
export const listBuilderInputOptions = async (): Promise<InputOption[]> => {
  const unit = alias(managedListItems, "input_unit");
  const category = alias(managedListItems, "input_category");
  const subcategory = alias(managedListItems, "input_subcategory");
  const dataType = alias(managedListItems, "input_data_type");
  const rows = await db
    .select({
      inputDefinitionId: measureDefinitions.id,
      name: measureDefinitions.name,
      unit: unit.name,
      category: category.name,
      subcategory: subcategory.name,
      dataType: dataType.name,
    })
    .from(measureDefinitions)
    .leftJoin(unit, eq(measureDefinitions.unit_id, unit.id))
    .leftJoin(category, eq(measureDefinitions.measures_group_id, category.id))
    .leftJoin(
      subcategory,
      eq(measureDefinitions.measures_subgroup_id, subcategory.id),
    )
    .leftJoin(dataType, eq(measureDefinitions.data_type_id, dataType.id))
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        // Exclude context-fed measures (e.g. the 16 Country Context measures fed
        // from country_context) — a BLO tracks initiative performance against
        // data-entry Inputs, not country-level context values.
        eq(measureDefinitions.is_context_fed, false),
      ),
    )
    .orderBy(asc(measureDefinitions.name));

  return rows;
};

// ---------------------------------------------------------------------------
// Per-utility scorecard (assembled overlay)
// ---------------------------------------------------------------------------

// Levels of the upper zone, top-down. Mandatory nodes form a contiguous subtree
// (a mandatory node's parent is always mandatory), so inserting in this order
// guarantees each child's parent row already exists.
const MANDATORY_LEVELS = [
  "perspective",
  "overall_objective",
  "key_focus_area",
  "strategic_objective",
  "strategic_lever",
] as const;

// Materialize the mandatory template nodes into a utility's overlay so the saved
// scorecard always matches what Build/Preview show (mandatory nodes are always
// part of a scorecard) and so those nodes are real, linkable rows on the
// Strategy Map. Idempotent and concurrency-safe: only missing nodes are
// inserted, top-down so each child's parent exists, with the (utility_id,
// template_node_id) unique index as a backstop. A no-op once fully materialized.
export const ensureMandatoryMaterialized = async (
  utilityId: number,
): Promise<void> => {
  await db.transaction(async (tx) => {
    // Perspectives have no parent.
    await tx.execute(sql`
      insert into bsc_utility_node (utility_id, template_node_id, parent_node_id, level, ord)
      select ${utilityId}, t.id, null, t.level, t.ord
      from bsc_template_node t
      where t.is_mandatory and t.is_active and t.level = 'perspective'
        and not exists (
          select 1 from bsc_utility_node x
          where x.utility_id = ${utilityId} and x.template_node_id = t.id
        )
      on conflict (utility_id, template_node_id) where template_node_id is not null do nothing
    `);
    // Lower levels attach to the already-materialized parent for this utility.
    for (const level of MANDATORY_LEVELS.slice(1)) {
      await tx.execute(sql`
        insert into bsc_utility_node (utility_id, template_node_id, parent_node_id, level, ord)
        select ${utilityId}, t.id, pu.id, t.level, t.ord
        from bsc_template_node t
        join bsc_template_node tp on tp.id = t.parent_id
        join bsc_utility_node pu
          on pu.utility_id = ${utilityId} and pu.template_node_id = tp.id
        where t.is_mandatory and t.is_active and t.level = ${level}
          and not exists (
            select 1 from bsc_utility_node x
            where x.utility_id = ${utilityId} and x.template_node_id = t.id
          )
        on conflict (utility_id, template_node_id) where template_node_id is not null do nothing
      `);
    }
  });
};

export const getUtilityScorecard = async (
  utilityId: number,
): Promise<ScorecardResponse> => {
  // Self-heal: ensure mandatory nodes exist before reading so Build, Preview and
  // the Strategy Map all reflect the same scorecard.
  await ensureMandatoryMaterialized(utilityId);

  const [nodes, objectives, initiatives, links, templateRows] =
    await Promise.all([
      db
        .select()
        .from(bscUtilityNodes)
        .where(eq(bscUtilityNodes.utility_id, utilityId))
        .orderBy(asc(bscUtilityNodes.ord)),
      db
        .select()
        .from(bscSpecificObjectives)
        .where(eq(bscSpecificObjectives.utility_id, utilityId))
        .orderBy(asc(bscSpecificObjectives.ord)),
      db
        .select()
        .from(bscInitiatives)
        .where(eq(bscInitiatives.utility_id, utilityId))
        .orderBy(asc(bscInitiatives.ord)),
      (() => {
        const inputUnit = alias(managedListItems, "link_input_unit");
        return db
          .select({
            id: bscKpiLinks.id,
            initiative_id: bscKpiLinks.initiative_id,
            kpi_def_id: bscKpiLinks.kpi_def_id,
            input_definition_id: bscKpiLinks.input_definition_id,
            pending_custom_kpi_request_id:
              bscKpiLinks.pending_custom_kpi_request_id,
            ord: bscKpiLinks.ord,
            kpi_name: kpiDefinitions.name,
            unit: managedListItems.name,
            input_name: measureDefinitions.name,
            input_unit: inputUnit.name,
          })
          .from(bscKpiLinks)
          .leftJoin(
            kpiDefinitions,
            eq(bscKpiLinks.kpi_def_id, kpiDefinitions.id),
          )
          .leftJoin(
            managedListItems,
            eq(kpiDefinitions.unit_id, managedListItems.id),
          )
          .leftJoin(
            measureDefinitions,
            eq(bscKpiLinks.input_definition_id, measureDefinitions.id),
          )
          .leftJoin(inputUnit, eq(measureDefinitions.unit_id, inputUnit.id))
          .where(eq(bscKpiLinks.utility_id, utilityId))
          .orderBy(asc(bscKpiLinks.ord));
      })(),
      db
        .select({
          id: bscTemplateNodes.id,
          is_mandatory: bscTemplateNodes.is_mandatory,
          label: bscTemplateNodes.label,
        })
        .from(bscTemplateNodes),
    ]);

  const templateById = new Map(templateRows.map((t) => [t.id, t]));

  // KPI links grouped by initiative.
  const linksByInitiative = new Map<string, ScorecardInitiative["kpis"]>();
  for (const link of links) {
    const list = linksByInitiative.get(link.initiative_id) ?? [];
    list.push({
      id: link.id,
      kpiDefinitionId: link.kpi_def_id,
      inputDefinitionId: link.input_definition_id,
      // Name/unit come from the KPI definition, or the Input definition when
      // this link tracks an Input instead.
      kpiName: link.kpi_name ?? link.input_name,
      unit: link.unit ?? link.input_unit,
      pendingCustomKpiRequestId: link.pending_custom_kpi_request_id,
      ord: link.ord,
    });
    linksByInitiative.set(link.initiative_id, list);
  }

  // Initiatives grouped by specific objective.
  const initiativesByObjective = new Map<string, ScorecardInitiative[]>();
  for (const ini of initiatives) {
    const list = initiativesByObjective.get(ini.specific_objective_id) ?? [];
    list.push({
      id: ini.id,
      title: ini.title,
      description: ini.description,
      kind: ini.kind,
      startDate: ini.start_date,
      targetCompletionDate: ini.target_completion_date,
      status: ini.status,
      ord: ini.ord,
      kpis: linksByInitiative.get(ini.id) ?? [],
    });
    initiativesByObjective.set(ini.specific_objective_id, list);
  }

  // Specific objectives grouped by lever node.
  const objectivesByLever = new Map<string, ScorecardSpecificObjective[]>();
  for (const obj of objectives) {
    const list = objectivesByLever.get(obj.lever_node_id) ?? [];
    list.push({
      id: obj.id,
      description: obj.description,
      ord: obj.ord,
      initiatives: initiativesByObjective.get(obj.id) ?? [],
    });
    objectivesByLever.set(obj.lever_node_id, list);
  }

  // Build the node tree.
  const nodeById = new Map<string, ScorecardNode>();
  for (const node of nodes) {
    const template = node.template_node_id
      ? templateById.get(node.template_node_id)
      : undefined;
    nodeById.set(node.id, {
      id: node.id,
      templateNodeId: node.template_node_id,
      level: node.level,
      label: node.label ?? template?.label ?? "",
      isMandatory: template?.is_mandatory ?? false,
      isCustom: node.template_node_id == null,
      ord: node.ord,
      children: [],
      specificObjectives: objectivesByLever.get(node.id) ?? [],
    });
  }

  const perspectives: ScorecardNode[] = [];
  for (const node of nodes) {
    const assembled = nodeById.get(node.id)!;
    if (node.parent_node_id && nodeById.has(node.parent_node_id)) {
      nodeById.get(node.parent_node_id)!.children.push(assembled);
    } else {
      perspectives.push(assembled);
    }
  }

  const sortRec = (list: ScorecardNode[]) => {
    list.sort((a, b) => a.ord - b.ord);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(perspectives);

  return { perspectives };
};

// ---------------------------------------------------------------------------
// Per-perspective overlay replace (autosave unit)
// ---------------------------------------------------------------------------

export const replacePerspectiveOverlay = async (
  utilityId: number,
  payload: SavePerspectiveOverlayPayload,
): Promise<void> => {
  await db.transaction(async (tx) => {
    // Serialize concurrent saves of the SAME perspective. The autosave debounce
    // (new-bsc-builder.tsx) doesn't wait for an in-flight save, so a follow-up
    // edit can fire a second delete-then-reinsert while the first is still
    // running. Without this lock the two transactions interleave and either
    // duplicate the whole subtree or collide on the (utility_id,
    // template_node_id) unique index (migration 0029). The xact lock makes each
    // save's delete+reinsert atomic relative to other saves of this perspective;
    // it auto-releases at commit/rollback.
    await tx.execute(
      sql`select pg_advisory_xact_lock(${utilityId}, hashtext(${payload.perspectiveTemplateNodeId}))`,
    );

    // Remove the existing overlay subtree for this perspective. Cascading FKs
    // (parent_node_id, lever -> objective -> initiative -> kpi link) clean up
    // all descendants and lower-zone rows.
    const existing = await tx
      .select({ id: bscUtilityNodes.id })
      .from(bscUtilityNodes)
      .where(
        and(
          eq(bscUtilityNodes.utility_id, utilityId),
          eq(
            bscUtilityNodes.template_node_id,
            payload.perspectiveTemplateNodeId,
          ),
          eq(bscUtilityNodes.level, "perspective"),
        ),
      );

    for (const row of existing) {
      await tx.delete(bscUtilityNodes).where(eq(bscUtilityNodes.id, row.id));
    }

    const insertNode = async (
      node: OverlayNodeInput,
      parentNodeId: string | null,
    ): Promise<void> => {
      const [inserted] = await tx
        .insert(bscUtilityNodes)
        .values({
          utility_id: utilityId,
          template_node_id: node.templateNodeId,
          parent_node_id: parentNodeId,
          level: node.level,
          label: node.label,
          ord: node.ord,
        })
        .returning({ id: bscUtilityNodes.id });

      for (const child of node.children) {
        await insertNode(child, inserted.id);
      }

      // Lower zone hangs off this node (strategic_lever in practice).
      for (const objective of node.specificObjectives) {
        const [objRow] = await tx
          .insert(bscSpecificObjectives)
          .values({
            utility_id: utilityId,
            lever_node_id: inserted.id,
            description: objective.description,
            ord: objective.ord,
          })
          .returning({ id: bscSpecificObjectives.id });

        for (const initiative of objective.initiatives) {
          const [iniRow] = await tx
            .insert(bscInitiatives)
            .values({
              utility_id: utilityId,
              specific_objective_id: objRow.id,
              title: initiative.title,
              description: initiative.description,
              kind: initiative.kind,
              start_date: initiative.startDate,
              target_completion_date: initiative.targetCompletionDate,
              status: initiative.status,
              ord: initiative.ord,
            })
            .returning({ id: bscInitiatives.id });

          for (const kpi of initiative.kpis) {
            await tx.insert(bscKpiLinks).values({
              utility_id: utilityId,
              initiative_id: iniRow.id,
              kpi_def_id: kpi.kpiDefinitionId,
              input_definition_id: kpi.inputDefinitionId,
              pending_custom_kpi_request_id: kpi.pendingCustomKpiRequestId,
              ord: kpi.ord,
            });
          }
        }
      }
    };

    await insertNode(payload.node, null);
  });
};

// ---------------------------------------------------------------------------
// KPI targets (shared per-utility, per-KPI) — write-through to kpiDefinitions
// ---------------------------------------------------------------------------

export const listKpiTargets = async (
  utilityId: number,
  kpiDefId: number,
): Promise<KpiTargetRow[]> => {
  const [row] = await db
    .select({ targets: kpiDefinitions.targets })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.id, kpiDefId))
    .limit(1);

  return (row?.targets ?? [])
    .filter((target) => target.utility_id === utilityId)
    .map((target) => ({
      year: target.year,
      month: target.month ?? null,
      targetValue: target.target_value,
    }));
};

export const saveKpiTargets = async (
  utilityId: number,
  kpiDefId: number,
  targets: KpiTargetRow[],
): Promise<void> => {
  const [existing] = await db
    .select({ targets: kpiDefinitions.targets })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.id, kpiDefId))
    .limit(1);

  if (!existing) {
    throw new Error("VALIDATION:KPI definition not found.");
  }

  // Dedupe by year/month and keep only valid rows for this utility.
  const byKey = new Map<
    string,
    { utility_id: number; year: number; month: number | null; target_value: string }
  >();
  for (const target of targets) {
    const year = Number(target.year);
    if (!Number.isInteger(year) || year < 1900 || year > 3000) continue;
    const month = target.month == null ? null : Number(target.month);
    if (month != null && (!Number.isInteger(month) || month < 1 || month > 12)) {
      continue;
    }
    const value = String(target.targetValue ?? "").trim();
    if (value.length === 0) continue;
    byKey.set(`${year}-${month ?? "fy"}`, {
      utility_id: utilityId,
      year,
      month,
      target_value: value,
    });
  }

  // Preserve other utilities' targets untouched.
  const others = (existing.targets ?? []).filter(
    (target) => target.utility_id !== utilityId,
  );

  await db
    .update(kpiDefinitions)
    .set({ targets: [...others, ...byKey.values()] })
    .where(eq(kpiDefinitions.id, kpiDefId));
};

// ---------------------------------------------------------------------------
// Target plan (generated period set per utility/KPI — for status pills)
// ---------------------------------------------------------------------------

export const saveKpiTargetPlan = async (
  utilityId: number,
  userId: string,
  kpiDefId: number,
  plan: TargetPlanInput,
): Promise<void> => {
  await db
    .insert(bscKpiTargetPlan)
    .values({
      utility_id: utilityId,
      kpi_def_id: kpiDefId,
      frequency: plan.frequency,
      start_date: plan.startDate || null,
      periods: plan.periods,
      updated_by_id: userId,
    })
    .onConflictDoUpdate({
      target: [bscKpiTargetPlan.utility_id, bscKpiTargetPlan.kpi_def_id],
      set: {
        frequency: plan.frequency,
        start_date: plan.startDate || null,
        periods: plan.periods,
        updated_by_id: userId,
        updated_at: new Date(),
      },
    });
};

export const listTargetPlans = async (
  utilityId: number,
): Promise<TargetPlanSummary[]> => {
  const rows = await db
    .select({
      kpi_def_id: bscKpiTargetPlan.kpi_def_id,
      periods: bscKpiTargetPlan.periods,
    })
    .from(bscKpiTargetPlan)
    .where(eq(bscKpiTargetPlan.utility_id, utilityId));

  return rows.map((row) => {
    const periods = row.periods ?? [];
    const values = periods.map((p) => {
      const trimmed = String(p.value ?? "").trim();
      if (trimmed.length === 0) return null;
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    });
    return {
      kpiDefinitionId: row.kpi_def_id,
      total: periods.length,
      filled: values.filter((v) => v != null).length,
      values,
    };
  });
};

