import type { BscLinkRelation, BscTemplateLevel } from "@/db/schema/bsc-builder";

export type { BscLinkRelation, BscTemplateLevel };

// ---------------------------------------------------------------------------
// Strategy Map read model (see docs/bsc-builder-spec.md §13)
//
// The map is NOT the full overlay tree. It collapses the hierarchy to a spine:
// Perspective (band) -> Key Focus Area (theme column) -> map node, plus the
// cause-effect edges the tree can't express. Nodes are overlay nodes whose
// effective is_map_node = true (the overlay already IS the Preview set: only
// selected/mandatory nodes have rows).
// ---------------------------------------------------------------------------

// A perspective band (top-level overlay node), ordered top-to-bottom by `ord`.
export type StrategyMapPerspective = {
  id: string; // bsc_utility_node id
  templateNodeId: string | null;
  label: string;
  ord: number;
};

// A node drawn on the map.
export type StrategyMapNode = {
  id: string; // bsc_utility_node id (edge endpoints reference this)
  label: string; // effective short caption (map_label, else full label)
  fullLabel: string; // underlying BSC label (tooltip)
  level: BscTemplateLevel;
  perspectiveId: string; // band this node sits in
  themeId: string | null; // key_focus_area ancestor (theme column), if any
  themeLabel: string | null;
  themeOrd: number; // for stable column ordering within a band
  x: number | null; // manual drag-to-position override; null = auto-layout
  y: number | null;
  ord: number;
};

// A directed cause-effect edge between two visible map nodes.
export type StrategyMapEdge = {
  id: string;
  sourceId: string; // bsc_utility_node id
  targetId: string;
  relation: BscLinkRelation;
  note: string | null;
  ord: number;
  // Mandatory master link (from bsc_template_link), cascaded to this utility and
  // not removable by the BLO. Utility-authored links are not locked.
  locked: boolean;
};

export type StrategyMapResponse = {
  perspectives: StrategyMapPerspective[];
  nodes: StrategyMapNode[];
  edges: StrategyMapEdge[];
};

// ---------------------------------------------------------------------------
// Write payloads
// ---------------------------------------------------------------------------

export type CreateObjectiveLinkInput = {
  sourceNodeId: string;
  targetNodeId: string;
  relation: BscLinkRelation;
  note: string | null;
};

// Create succeeds even when it closes a cycle (a map is usually a DAG, but
// feedback loops are not forbidden) — the warning surfaces that to the user.
export type CreateObjectiveLinkResult = {
  id: string;
  warning: string | null;
};

export type UpdateObjectiveLinkInput = {
  relation?: BscLinkRelation;
  note?: string | null;
  ord?: number;
};

// Per-node map-display overrides (label, on/off, drag position). Each field is
// optional; only provided fields are written. Nulls clear the override (inherit
// template default / auto-layout).
export type SetNodeMapDisplayInput = {
  mapLabel?: string | null;
  isMapNode?: boolean | null;
  mapX?: number | null;
  mapY?: number | null;
};
