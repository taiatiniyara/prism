import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/db/connection";
import {
  bscInitiatives,
  bscKpiLinks,
  bscSpecificObjectives,
  bscTemplateNodes,
  bscUtilityNodes,
} from "@/db/schema/bsc-builder";
import { kpiDefinitions, kpiTargetTrajectory } from "@/db/schema/kpi";

import type {
  CreateTemplateNodePayload,
  KpiOption,
  KpiTargetRow,
  KpiTrajectory,
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
// Master template
// ---------------------------------------------------------------------------

export const listTemplateTree = async (): Promise<TemplateNode[]> => {
  const rows = await db
    .select()
    .from(bscTemplateNodes)
    .where(eq(bscTemplateNodes.is_active, true))
    .orderBy(asc(bscTemplateNodes.ord));

  const byId = new Map<string, TemplateNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      level: row.level,
      label: row.label,
      isMandatory: row.is_mandatory,
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
      ...(payload.ord !== undefined ? { ord: payload.ord } : {}),
      ...(payload.isActive !== undefined ? { is_active: payload.isActive } : {}),
      updated_at: new Date(),
    })
    .where(eq(bscTemplateNodes.id, id));
};

export const deleteTemplateNode = async (id: string): Promise<void> => {
  await db.delete(bscTemplateNodes).where(eq(bscTemplateNodes.id, id));
};

// ---------------------------------------------------------------------------
// KPI picker options (active + visible to the utility; report-period agnostic)
// ---------------------------------------------------------------------------

export const listBuilderKpiOptions = async (
  utilityId: number,
): Promise<KpiOption[]> => {
  const rows = await db
    .select({
      kpiDefinitionId: kpiDefinitions.id,
      name: kpiDefinitions.name,
    })
    .from(kpiDefinitions)
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

// ---------------------------------------------------------------------------
// Per-utility scorecard (assembled overlay)
// ---------------------------------------------------------------------------

export const getUtilityScorecard = async (
  utilityId: number,
): Promise<ScorecardResponse> => {
  const [nodes, objectives, initiatives, links, trajectories, templateRows] =
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
      db
        .select({
          id: bscKpiLinks.id,
          initiative_id: bscKpiLinks.initiative_id,
          kpi_def_id: bscKpiLinks.kpi_def_id,
          pending_custom_kpi_request_id:
            bscKpiLinks.pending_custom_kpi_request_id,
          ord: bscKpiLinks.ord,
          kpi_name: kpiDefinitions.name,
        })
        .from(bscKpiLinks)
        .leftJoin(
          kpiDefinitions,
          eq(bscKpiLinks.kpi_def_id, kpiDefinitions.id),
        )
        .where(eq(bscKpiLinks.utility_id, utilityId))
        .orderBy(asc(bscKpiLinks.ord)),
      db
        .select({
          kpi_def_id: kpiTargetTrajectory.kpi_def_id,
          trajectory: kpiTargetTrajectory.trajectory,
        })
        .from(kpiTargetTrajectory)
        .where(eq(kpiTargetTrajectory.utility_id, utilityId)),
      db
        .select({
          id: bscTemplateNodes.id,
          is_mandatory: bscTemplateNodes.is_mandatory,
          label: bscTemplateNodes.label,
        })
        .from(bscTemplateNodes),
    ]);

  const templateById = new Map(templateRows.map((t) => [t.id, t]));
  const trajectoryByKpi = new Map<number, KpiTrajectory>();
  for (const t of trajectories) {
    trajectoryByKpi.set(t.kpi_def_id, t.trajectory as KpiTrajectory);
  }

  // KPI links grouped by initiative.
  const linksByInitiative = new Map<string, ScorecardInitiative["kpis"]>();
  for (const link of links) {
    const list = linksByInitiative.get(link.initiative_id) ?? [];
    list.push({
      id: link.id,
      kpiDefinitionId: link.kpi_def_id,
      kpiName: link.kpi_name,
      pendingCustomKpiRequestId: link.pending_custom_kpi_request_id,
      trajectory:
        link.kpi_def_id != null
          ? (trajectoryByKpi.get(link.kpi_def_id) ?? null)
          : null,
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
              ord: initiative.ord,
            })
            .returning({ id: bscInitiatives.id });

          for (const kpi of initiative.kpis) {
            await tx.insert(bscKpiLinks).values({
              utility_id: utilityId,
              initiative_id: iniRow.id,
              kpi_def_id: kpi.kpiDefinitionId,
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
// Trajectory (shared per-utility, per-KPI)
// ---------------------------------------------------------------------------

export const setKpiTrajectory = async (
  utilityId: number,
  userId: string,
  kpiDefinitionId: number,
  trajectory: KpiTrajectory | null,
): Promise<void> => {
  if (trajectory == null) {
    await db
      .delete(kpiTargetTrajectory)
      .where(
        and(
          eq(kpiTargetTrajectory.utility_id, utilityId),
          eq(kpiTargetTrajectory.kpi_def_id, kpiDefinitionId),
        ),
      );
    return;
  }

  await db
    .insert(kpiTargetTrajectory)
    .values({
      utility_id: utilityId,
      kpi_def_id: kpiDefinitionId,
      trajectory,
      updated_by_id: userId,
    })
    .onConflictDoUpdate({
      target: [kpiTargetTrajectory.utility_id, kpiTargetTrajectory.kpi_def_id],
      set: {
        trajectory,
        updated_by_id: userId,
        updated_at: new Date(),
      },
    });
};
