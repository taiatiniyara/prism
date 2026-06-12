import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/connection";
import {
  bscObjectiveLinks,
  bscTemplateNodes,
  bscUtilityNodes,
} from "@/db/schema/bsc-builder";

import type {
  CreateObjectiveLinkInput,
  CreateObjectiveLinkResult,
  SetNodeMapDisplayInput,
  StrategyMapEdge,
  StrategyMapNode,
  StrategyMapPerspective,
  StrategyMapResponse,
  UpdateObjectiveLinkInput,
} from "./strategy-map.types";

// A flattened overlay node joined with its template defaults, enough to resolve
// effective map-display fields and walk ancestors.
type OverlayRow = {
  id: string;
  parentId: string | null;
  templateNodeId: string | null;
  level: StrategyMapNode["level"];
  ord: number;
  uLabel: string | null;
  uMapLabel: string | null;
  uIsMapNode: boolean | null;
  mapX: number | null;
  mapY: number | null;
  tLabel: string | null;
  tMapLabel: string | null;
  tIsMapNode: boolean | null;
};

const fetchOverlayRows = async (utilityId: number): Promise<OverlayRow[]> =>
  db
    .select({
      id: bscUtilityNodes.id,
      parentId: bscUtilityNodes.parent_node_id,
      templateNodeId: bscUtilityNodes.template_node_id,
      level: bscUtilityNodes.level,
      ord: bscUtilityNodes.ord,
      uLabel: bscUtilityNodes.label,
      uMapLabel: bscUtilityNodes.map_label,
      uIsMapNode: bscUtilityNodes.is_map_node,
      mapX: bscUtilityNodes.map_x,
      mapY: bscUtilityNodes.map_y,
      tLabel: bscTemplateNodes.label,
      tMapLabel: bscTemplateNodes.map_label,
      tIsMapNode: bscTemplateNodes.is_map_node,
    })
    .from(bscUtilityNodes)
    .leftJoin(
      bscTemplateNodes,
      eq(bscUtilityNodes.template_node_id, bscTemplateNodes.id),
    )
    .where(eq(bscUtilityNodes.utility_id, utilityId))
    .orderBy(asc(bscUtilityNodes.ord));

// Effective on-map = coalesce(utility, template, false). Custom nodes (no
// template) fall back to the utility value only.
const effectiveIsMapNode = (row: OverlayRow): boolean =>
  row.uIsMapNode ?? row.tIsMapNode ?? false;

// Effective map caption = coalesce(utility map_label, template map_label,
// utility label, template label).
const effectiveMapLabel = (row: OverlayRow): string =>
  row.uMapLabel ?? row.tMapLabel ?? row.uLabel ?? row.tLabel ?? "";

// Underlying BSC label (for tooltip) = coalesce(utility label, template label).
const effectiveFullLabel = (row: OverlayRow): string =>
  row.uLabel ?? row.tLabel ?? "";

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export const getStrategyMap = async (
  utilityId: number,
): Promise<StrategyMapResponse> => {
  const [rows, linkRows] = await Promise.all([
    fetchOverlayRows(utilityId),
    db
      .select()
      .from(bscObjectiveLinks)
      .where(eq(bscObjectiveLinks.utility_id, utilityId))
      .orderBy(asc(bscObjectiveLinks.ord)),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));

  // Climb parent_node_id to the nearest ancestor (inclusive) at `level`.
  const ancestorAt = (
    row: OverlayRow,
    level: StrategyMapNode["level"],
  ): OverlayRow | null => {
    let cur: OverlayRow | undefined = row;
    while (cur) {
      if (cur.level === level) return cur;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return null;
  };

  const perspectives: StrategyMapPerspective[] = rows
    .filter((r) => r.level === "perspective")
    .map((r) => ({
      id: r.id,
      templateNodeId: r.templateNodeId,
      label: effectiveMapLabel(r),
      ord: r.ord,
    }))
    .sort((a, b) => a.ord - b.ord);

  const nodes: StrategyMapNode[] = [];
  for (const row of rows) {
    if (!effectiveIsMapNode(row)) continue;
    const perspective = ancestorAt(row, "perspective");
    if (!perspective) continue; // map nodes must live under a perspective band
    const theme = ancestorAt(row, "key_focus_area");
    nodes.push({
      id: row.id,
      label: effectiveMapLabel(row),
      fullLabel: effectiveFullLabel(row),
      level: row.level,
      perspectiveId: perspective.id,
      themeId: theme?.id ?? null,
      themeLabel: theme ? effectiveMapLabel(theme) : null,
      themeOrd: theme?.ord ?? 0,
      x: row.mapX,
      y: row.mapY,
      ord: row.ord,
    });
  }

  // Only show edges whose endpoints are both currently visible map nodes.
  const visible = new Set(nodes.map((n) => n.id));
  const edges: StrategyMapEdge[] = linkRows
    .filter((l) => visible.has(l.source_node_id) && visible.has(l.target_node_id))
    .map((l) => ({
      id: l.id,
      sourceId: l.source_node_id,
      targetId: l.target_node_id,
      relation: l.relation,
      note: l.note,
      ord: l.ord,
    }));

  return { perspectives, nodes, edges };
};

// ---------------------------------------------------------------------------
// Link CRUD (rules: docs/bsc-builder-spec.md §13.4)
// ---------------------------------------------------------------------------

// Does adding source -> target close a cycle? It does iff target already
// reaches source over the existing edges. BFS over the current adjacency.
const closesCycle = (
  existing: { source_node_id: string; target_node_id: string }[],
  sourceId: string,
  targetId: string,
): boolean => {
  const adj = new Map<string, string[]>();
  for (const e of existing) {
    const list = adj.get(e.source_node_id) ?? [];
    list.push(e.target_node_id);
    adj.set(e.source_node_id, list);
  }
  const seen = new Set<string>();
  const queue = [targetId];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === sourceId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) queue.push(next);
  }
  return false;
};

export const createObjectiveLink = async (
  utilityId: number,
  input: CreateObjectiveLinkInput,
): Promise<CreateObjectiveLinkResult> => {
  const { sourceNodeId, targetNodeId, relation, note } = input;

  if (sourceNodeId === targetNodeId) {
    throw new Error("VALIDATION:A link's source and target must differ.");
  }

  // Both endpoints must belong to this utility and be map nodes.
  const endpoints = await db
    .select({
      id: bscUtilityNodes.id,
      uIsMapNode: bscUtilityNodes.is_map_node,
      tIsMapNode: bscTemplateNodes.is_map_node,
    })
    .from(bscUtilityNodes)
    .leftJoin(
      bscTemplateNodes,
      eq(bscUtilityNodes.template_node_id, bscTemplateNodes.id),
    )
    .where(
      and(
        eq(bscUtilityNodes.utility_id, utilityId),
        inArray(bscUtilityNodes.id, [sourceNodeId, targetNodeId]),
      ),
    );

  if (endpoints.length !== 2) {
    throw new Error(
      "VALIDATION:Both endpoints must be nodes in this utility's scorecard.",
    );
  }
  const allMapNodes = endpoints.every((e) => (e.uIsMapNode ?? e.tIsMapNode) === true);
  if (!allMapNodes) {
    throw new Error(
      "VALIDATION:Both endpoints must be map nodes. Add them to the map first.",
    );
  }

  const existing = await db
    .select({
      source_node_id: bscObjectiveLinks.source_node_id,
      target_node_id: bscObjectiveLinks.target_node_id,
    })
    .from(bscObjectiveLinks)
    .where(eq(bscObjectiveLinks.utility_id, utilityId));

  if (
    existing.some(
      (e) =>
        e.source_node_id === sourceNodeId && e.target_node_id === targetNodeId,
    )
  ) {
    throw new Error("VALIDATION:That link already exists.");
  }

  const warning = closesCycle(existing, sourceNodeId, targetNodeId)
    ? "This link closes a cause-effect cycle. Strategy maps are usually acyclic — added anyway."
    : null;

  const [row] = await db
    .insert(bscObjectiveLinks)
    .values({
      utility_id: utilityId,
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      relation,
      note,
    })
    .returning({ id: bscObjectiveLinks.id });

  return { id: row.id, warning };
};

export const updateObjectiveLink = async (
  utilityId: number,
  id: string,
  input: UpdateObjectiveLinkInput,
): Promise<void> => {
  await db
    .update(bscObjectiveLinks)
    .set({
      ...(input.relation !== undefined ? { relation: input.relation } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.ord !== undefined ? { ord: input.ord } : {}),
      updated_at: new Date(),
    })
    .where(
      and(
        eq(bscObjectiveLinks.id, id),
        eq(bscObjectiveLinks.utility_id, utilityId),
      ),
    );
};

export const deleteObjectiveLink = async (
  utilityId: number,
  id: string,
): Promise<void> => {
  await db
    .delete(bscObjectiveLinks)
    .where(
      and(
        eq(bscObjectiveLinks.id, id),
        eq(bscObjectiveLinks.utility_id, utilityId),
      ),
    );
};

// ---------------------------------------------------------------------------
// Per-node map-display overrides (label / on-off / drag position)
// ---------------------------------------------------------------------------

export const setNodeMapDisplay = async (
  utilityId: number,
  nodeId: string,
  input: SetNodeMapDisplayInput,
): Promise<void> => {
  const set: Record<string, unknown> = { updated_at: new Date() };
  if (input.mapLabel !== undefined) set.map_label = input.mapLabel;
  if (input.isMapNode !== undefined) set.is_map_node = input.isMapNode;
  if (input.mapX !== undefined) set.map_x = input.mapX;
  if (input.mapY !== undefined) set.map_y = input.mapY;

  await db
    .update(bscUtilityNodes)
    .set(set)
    .where(
      and(
        eq(bscUtilityNodes.id, nodeId),
        eq(bscUtilityNodes.utility_id, utilityId),
      ),
    );
};
