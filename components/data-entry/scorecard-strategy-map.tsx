"use client";

import { useMemo, useState } from "react";
import {
  BaseEdge,
  Background,
  Handle,
  Controls,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  ScorecardInputRow,
  ScorecardNodeRef,
  ScorecardRelationship,
} from "@/app/data-entry/balanced-scorecard/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PerspectiveLevel = 1 | 2 | 3 | 4;

type DraftHierarchyInitiative = {
  description: string;
  kpis?: string[];
};

type DraftHierarchyObjective = {
  description: string;
  keyInitiatives?: DraftHierarchyInitiative[];
};

type StrategyMapHierarchy = Record<PerspectiveLevel, DraftHierarchyObjective[]>;

type InitiativeGroup = {
  label: string;
  kpis: string[];
};

type ObjectiveGroup = {
  label: string;
  initiatives: InitiativeGroup[];
};

type PerspectiveGroup = {
  level: PerspectiveLevel;
  label: string;
  objectives: ObjectiveGroup[];
};

type Model = {
  nodes: Node[];
  edges: Edge[];
  nodeRefByNodeId: Map<string, ScorecardNodeRef>;
};

type NodeBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ObjectiveNodeData = {
  label: string;
};

type RelationshipEdgeData = {
  routeOffset: number;
  viaX?: number;
  viaY?: number;
};

type LaneNodeData = {
  label: string;
};

function LaneNode({ data }: NodeProps<Node<LaneNodeData>>) {
  return <div>{data.label}</div>;
}

function ObjectiveNode({ data }: NodeProps<Node<ObjectiveNodeData>>) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
      />

      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
      />

      <div>{data.label}</div>
    </>
  );
}

const NODE_TYPES = {
  laneNode: LaneNode,
  objectiveNode: ObjectiveNode,
};

function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  source,
  target,
  style,
}: EdgeProps<Edge<RelationshipEdgeData>>) {
  const sourceLevel = Number(source.split(":")[1] ?? "0");
  const targetLevel = Number(target.split(":")[1] ?? "0");
  const sameLane = sourceLevel === targetLevel;
  const horizontalDistance = Math.abs(targetX - sourceX);
  const controlOffset = Math.max(60, horizontalDistance * 0.35);

  const path = sameLane
    ? `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY - controlOffset} ${targetX} ${targetY - controlOffset} ${targetX} ${targetY}`
    : `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY} ${targetX - controlOffset} ${targetY} ${targetX} ${targetY}`;

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
    />
  );
}

const EDGE_TYPES = {
  relationshipEdge: RelationshipEdge,
};

const DEFAULT_PERSPECTIVES: Array<{ level: PerspectiveLevel; label: string }> =
  [
    { level: 1, label: "Financial" },
    { level: 2, label: "Customer" },
    { level: 3, label: "Operations" },
    { level: 4, label: "Development" },
  ];

const LANE_COLORS: Record<PerspectiveLevel, string> = {
  1: "#fef3c7",
  2: "#dcfce7",
  3: "#dbeafe",
  4: "#fee2e2",
};

const LANE_ACCENT: Record<PerspectiveLevel, string> = {
  1: "#d97706",
  2: "#16a34a",
  3: "#2563eb",
  4: "#dc2626",
};

const RELATION_COLOR: Record<
  ScorecardRelationship["relationshipType"],
  string
> = {
  influences: "#64748b",
  depends_on: "#d97706",
  contributes_to: "#16a34a",
  blocks: "#dc2626",
};

const RELATION_LABEL: Record<
  ScorecardRelationship["relationshipType"],
  string
> = {
  influences: "Influences",
  depends_on: "Depends on",
  contributes_to: "Contributes to",
  blocks: "Blocks",
};

const RELATION_DASH: Record<
  ScorecardRelationship["relationshipType"],
  string | undefined
> = {
  influences: "8 5",
  depends_on: "10 5",
  contributes_to: undefined,
  blocks: "3 4",
};

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const asLevel = (value: number): PerspectiveLevel | null => {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }

  return null;
};

const clean = (value: string | null | undefined): string => value?.trim() ?? "";

const toKpiLabel = (row: ScorecardInputRow): string => {
  const label = clean(row.kpiName);
  if (label.length > 0) {
    return label;
  }

  return `KPI #${row.kpiDefinitionId}`;
};

const groupHierarchy = (
  hierarchy: StrategyMapHierarchy,
): PerspectiveGroup[] => {
  return DEFAULT_PERSPECTIVES.map((item) => {
    const objectivesByLabel = new Map<string, Map<string, Set<string>>>();

    for (const objective of hierarchy[item.level] ?? []) {
      const objectiveLabel =
        clean(objective.description) || "Unassigned Objective";
      const initiatives = objectivesByLabel.get(objectiveLabel) ?? new Map();

      for (const initiative of objective.keyInitiatives ?? []) {
        const initiativeLabel =
          clean(initiative.description) || "Unassigned Initiative";
        const kpis = initiatives.get(initiativeLabel) ?? new Set<string>();
        for (const kpi of initiative.kpis ?? []) {
          const label = clean(kpi);
          if (label.length > 0) {
            kpis.add(label);
          }
        }
        initiatives.set(initiativeLabel, kpis);
      }

      objectivesByLabel.set(objectiveLabel, initiatives);
    }

    const objectives: ObjectiveGroup[] = Array.from(objectivesByLabel.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([objectiveLabel, initiatives]) => ({
        label: objectiveLabel,
        initiatives: Array.from(initiatives.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([initiativeLabel, kpis]) => ({
            label: initiativeLabel,
            kpis: Array.from(kpis).sort((a, b) => a.localeCompare(b)),
          })),
      }));

    return {
      level: item.level,
      label: item.label,
      objectives,
    };
  });
};

const groupRows = (rows: ScorecardInputRow[]): PerspectiveGroup[] => {
  const groups = new Map<
    PerspectiveLevel,
    {
      label: string;
      objectives: Map<string, Map<string, Set<string>>>;
    }
  >();

  for (const row of rows) {
    const level = asLevel(row.perspectiveLevel);
    if (level == null) {
      continue;
    }

    const objectiveLabel = clean(row.objective) || "Unassigned Objective";
    const initiativeLabel =
      clean(row.keyInitiative) || "Unassigned Initiative";
    const kpiLabel = toKpiLabel(row);

    const perspective = groups.get(level) ?? {
      label: clean(row.perspectiveLabel),
      objectives: new Map<string, Map<string, Set<string>>>(),
    };

    const initiatives =
      perspective.objectives.get(objectiveLabel) ?? new Map<string, Set<string>>();
    const kpis = initiatives.get(initiativeLabel) ?? new Set<string>();
    kpis.add(kpiLabel);
    initiatives.set(initiativeLabel, kpis);
    perspective.objectives.set(objectiveLabel, initiatives);
    groups.set(level, perspective);
  }

  return DEFAULT_PERSPECTIVES.map((item) => {
    const perspective = groups.get(item.level);

    const objectives: ObjectiveGroup[] = Array.from(
      perspective?.objectives.entries() ?? [],
    )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([objectiveLabel, initiatives]) => ({
        label: objectiveLabel,
        initiatives: Array.from(initiatives.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([initiativeLabel, kpis]) => ({
            label: initiativeLabel,
            kpis: Array.from(kpis).sort((a, b) => a.localeCompare(b)),
          })),
      }));

    return {
      level: item.level,
      label: perspective?.label || item.label,
      objectives,
    };
  });
};

const mergePerspectiveGroups = (
  hierarchyGroups: PerspectiveGroup[],
  rowGroups: PerspectiveGroup[],
): PerspectiveGroup[] => {
  return DEFAULT_PERSPECTIVES.map((item, index) => {
    const fromHierarchy = hierarchyGroups[index];
    const fromRows = rowGroups[index];

    const objectiveMap = new Map<string, Map<string, Set<string>>>();

    for (const source of [fromHierarchy, fromRows]) {
      for (const objective of source.objectives) {
        const initiatives =
          objectiveMap.get(objective.label) ?? new Map<string, Set<string>>();

        for (const initiative of objective.initiatives) {
          const kpis = initiatives.get(initiative.label) ?? new Set<string>();
          for (const kpi of initiative.kpis) {
            kpis.add(kpi);
          }
          initiatives.set(initiative.label, kpis);
        }

        objectiveMap.set(objective.label, initiatives);
      }
    }

    const objectives: ObjectiveGroup[] = Array.from(objectiveMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([objectiveLabel, initiatives]) => ({
        label: objectiveLabel,
        initiatives: Array.from(initiatives.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([initiativeLabel, kpis]) => ({
            label: initiativeLabel,
            kpis: Array.from(kpis).sort((a, b) => a.localeCompare(b)),
          })),
      }));

    return {
      level: item.level,
      label: fromRows.label || fromHierarchy.label,
      objectives,
    };
  });
};

const resolveHandles = (
  sourceBox: NodeBox,
  targetBox: NodeBox,
): { sourceHandle: string; targetHandle: string } => {
  const sourceCx = sourceBox.x + sourceBox.width / 2;
  const sourceCy = sourceBox.y + sourceBox.height / 2;
  const targetCx = targetBox.x + targetBox.width / 2;
  const targetCy = targetBox.y + targetBox.height / 2;

  const dx = targetCx - sourceCx;
  const dy = targetCy - sourceCy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { sourceHandle: "source-right", targetHandle: "target-left" };
    }

    return { sourceHandle: "source-left", targetHandle: "target-right" };
  }

  if (dy >= 0) {
    return { sourceHandle: "source-bottom", targetHandle: "target-top" };
  }

  return { sourceHandle: "source-top", targetHandle: "target-bottom" };
};

const buildModel = (
  rows: ScorecardInputRow[],
  relationships: ScorecardRelationship[],
  hierarchyByPerspective: StrategyMapHierarchy | null,
  expandedObjectiveIds: Set<string>,
  expandedInitiativeIds: Set<string>,
): Model => {
  const groupedFromRows = groupRows(rows);
  const grouped =
    hierarchyByPerspective != null
      ? mergePerspectiveGroups(
          groupHierarchy(hierarchyByPerspective),
          groupedFromRows,
        )
      : groupedFromRows;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeRefByNodeId = new Map<string, ScorecardNodeRef>();

  const objectiveIdByKey = new Map<string, string>();
  const objectiveBoxByNodeId = new Map<string, NodeBox>();
  const fanOutCounts = new Map<string, number>();
  const fanInCounts = new Map<string, number>();
  const laneBoundsByLevel = new Map<
    PerspectiveLevel,
    { top: number; bottom: number }
  >();

  const laneWidth = 1200;
  const laneGap = 24;
  const lanePaddingX = 26;
  const laneLabelGutterWidth = 170;
  const laneHeaderHeight = 48;
  const objectiveColumns = 4;
  const objectiveColGap = 48;
  const objectiveRowGap = 48;
  const objectiveNodeHeight = 86;
  const initiativeNodeHeight = 58;
  const kpiNodeHeight = 46;
  const childIndent = 24;
  const initiativeMinWidth = 120;
  const kpiMinWidth = 100;
  const initiativeMaxPerRow = 3;
  const kpiMaxPerRow = 4;
  const objectiveToInitiativeGap = 14;
  const initiativesGap = 22;
  const kpiGap = 16;
  const initiativeRowGap = 14;
  const kpiRowGap = 10;
  const levelGap = 22;
  const objectiveGridStartX = lanePaddingX + laneLabelGutterWidth;
  const objectiveNodeWidth =
    (laneWidth -
      objectiveGridStartX -
      lanePaddingX -
      objectiveColGap * (objectiveColumns - 1)) /
    objectiveColumns;
  const laneZIndex = 0;
  const connectorZIndex = 10;
  const nodeZIndex = 20;
  const childContentWidth = objectiveNodeWidth - childIndent * 2;
  const initiativesPerRow = Math.max(
    1,
    Math.min(
      initiativeMaxPerRow,
      Math.floor((childContentWidth + initiativesGap) / (initiativeMinWidth + initiativesGap)),
    ),
  );
  const kpisPerRow = Math.max(
    1,
    Math.min(
      kpiMaxPerRow,
      Math.floor((childContentWidth + kpiGap) / (kpiMinWidth + kpiGap)),
    ),
  );
  const laneBottomPadding = 24;

  let laneY = 0;

  for (const perspective of grouped) {
    const objectiveBlocks = perspective.objectives.map((objective, index) => {
      const objectiveId = `objective:${perspective.level}:${slug(objective.label)}:${index}`;
      const isExpanded = expandedObjectiveIds.has(objectiveId);

      const initiatives = objective.initiatives.map((initiative, initiativeIndex) => {
        const initiativeId = `initiative:${objectiveId}:${initiativeIndex}`;
        const initiativeExpanded = expandedInitiativeIds.has(initiativeId);

        return {
          id: initiativeId,
          label: initiative.label,
          expanded: initiativeExpanded,
          kpis: initiative.kpis,
        };
      });

      const expandedKpis = initiatives.flatMap((initiative) =>
        initiative.expanded
          ? initiative.kpis.map((kpi, kpiIndex) => ({
              id: `kpi:${initiative.id}:${kpiIndex}`,
              label: kpi,
              parentInitiativeId: initiative.id,
            }))
          : [],
      );

      const initiativeRowCount = Math.max(
        initiatives.length > 0 ? 1 : 0,
        Math.ceil(initiatives.length / initiativesPerRow),
      );
      const kpiRowCount = Math.ceil(expandedKpis.length / kpisPerRow);

      const childRowsHeight =
        isExpanded && initiatives.length > 0
          ? objectiveToInitiativeGap +
            initiativeRowCount * initiativeNodeHeight +
            Math.max(0, initiativeRowCount - 1) * initiativeRowGap +
            (expandedKpis.length > 0
              ? levelGap +
                kpiRowCount * kpiNodeHeight +
                Math.max(0, kpiRowCount - 1) * kpiRowGap
              : 0)
          : 0;

      return {
        objective,
        objectiveId,
        isExpanded,
        initiatives,
        expandedKpis,
        blockHeight: objectiveNodeHeight + (isExpanded ? childRowsHeight : 0),
      };
    });

    const objectiveRowCount = Math.max(
      1,
      Math.ceil(objectiveBlocks.length / objectiveColumns),
    );
    const rowHeights = Array.from({ length: objectiveRowCount }, (_, row) => {
      const rowStart = row * objectiveColumns;
      const rowBlocks = objectiveBlocks.slice(rowStart, rowStart + objectiveColumns);
      const tallest = rowBlocks.reduce(
        (max, block) => Math.max(max, block.blockHeight),
        objectiveNodeHeight,
      );
      return tallest;
    });

    const laneHeight = Math.max(
      180,
      laneHeaderHeight +
        rowHeights.reduce((sum, value) => sum + value, 0) +
        Math.max(0, rowHeights.length - 1) * objectiveRowGap +
        laneBottomPadding,
    );
    const laneId = `lane:${perspective.level}`;
    laneBoundsByLevel.set(perspective.level, {
      top: laneY,
      bottom: laneY + laneHeight,
    });

    nodes.push({
      id: laneId,
      type: "laneNode",
      zIndex: laneZIndex,
      selectable: false,
      draggable: false,
      connectable: false,
      position: { x: 0, y: laneY },
      style: {
        width: laneWidth,
        height: laneHeight,
        border: `2px solid ${LANE_ACCENT[perspective.level]}`,
        borderRadius: 12,
        background: LANE_COLORS[perspective.level],
        padding: "0 0 0 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        fontSize: 18,
        fontWeight: 700,
        color: "#0f172a",
      },
      data: {
        label: perspective.label,
      },
    });

    const rowStartYs: number[] = [];
    let rowCursorY = laneY + laneHeaderHeight;
    for (const height of rowHeights) {
      rowStartYs.push(rowCursorY);
      rowCursorY += height + objectiveRowGap;
    }

    for (const [objectiveIndex, block] of objectiveBlocks.entries()) {
      const { objective, objectiveId, initiatives, expandedKpis } = block;
      const objectiveKey = `${perspective.level}|${slug(objective.label)}`;
      objectiveIdByKey.set(objectiveKey, objectiveId);

      const column = objectiveIndex % objectiveColumns;
      const row = Math.floor(objectiveIndex / objectiveColumns);
      const objectiveX =
        objectiveGridStartX + column * (objectiveNodeWidth + objectiveColGap);
      const objectiveY = rowStartYs[row] ?? laneY + laneHeaderHeight;

      nodes.push({
        id: objectiveId,
        type: "objectiveNode",
        zIndex: nodeZIndex,
        position: { x: objectiveX, y: objectiveY },
        style: {
          width: objectiveNodeWidth,
          minHeight: objectiveNodeHeight,
          border: "3px solid #1d4ed8",
          borderRadius: 12,
          background: "#eff6ff",
          fontSize: 13,
          lineHeight: 1.35,
          padding: "12px",
          boxShadow: "0 2px 10px rgba(30, 64, 175, 0.12)",
          cursor: "pointer",
        },
        data: {
          label: `${block.isExpanded ? "▾" : "▸"} ${objective.label}`,
        },
      });
      objectiveBoxByNodeId.set(objectiveId, {
        x: objectiveX,
        y: objectiveY,
        width: objectiveNodeWidth,
        height: objectiveNodeHeight,
      });
      nodeRefByNodeId.set(objectiveId, {
        level: "objective",
        perspectiveLevel: perspective.level,
        objectiveDescription: objective.label,
      });

      if (block.isExpanded && initiatives.length > 0) {
        const initiativeY = objectiveY + objectiveNodeHeight + objectiveToInitiativeGap;
        const initiativesWidth =
          objectiveNodeWidth -
          childIndent * 2 -
          initiativesGap * (initiativesPerRow - 1);
        const initiativeNodeWidth = Math.max(
          initiativeMinWidth,
          initiativesWidth / initiativesPerRow,
        );

        for (const [initiativeIndex, initiative] of initiatives.entries()) {
          const initiativeColumn = initiativeIndex % initiativesPerRow;
          const initiativeRow = Math.floor(initiativeIndex / initiativesPerRow);
          const nodeX =
            objectiveX +
            childIndent +
            initiativeColumn * (initiativeNodeWidth + initiativesGap);
          const nodeY =
            initiativeY + initiativeRow * (initiativeNodeHeight + initiativeRowGap);

          nodes.push({
            id: initiative.id,
            zIndex: nodeZIndex,
            position: {
              x: nodeX,
              y: nodeY,
            },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            connectable: false,
            selectable: false,
            draggable: false,
            style: {
              width: initiativeNodeWidth,
              minHeight: initiativeNodeHeight,
              border: "2px solid #7c3aed",
              borderRadius: 10,
              background: "#f5f3ff",
              fontSize: 12,
              lineHeight: 1.3,
              padding: "8px 10px",
              color: "#0f172a",
            },
            data: {
              label: `${initiative.expanded ? "▾" : "▸"} ${initiative.label}`,
            },
          });

          edges.push({
            id: `tree:${objectiveId}->${initiative.id}`,
            source: objectiveId,
            target: initiative.id,
            sourceHandle: "source-bottom",
            type: "smoothstep",
            zIndex: connectorZIndex,
            interactionWidth: 12,
            selectable: false,
            style: {
              stroke: "#8b5cf6",
              strokeWidth: 1.8,
              strokeDasharray: "4 4",
            },
          });
        }

        if (expandedKpis.length > 0) {
          const initiativeRowCount = Math.ceil(initiatives.length / initiativesPerRow);
          const kpiY =
            initiativeY +
            initiativeRowCount * initiativeNodeHeight +
            Math.max(0, initiativeRowCount - 1) * initiativeRowGap +
            levelGap;
          const kpiWidth =
            (objectiveNodeWidth - childIndent * 2 - kpiGap * (kpisPerRow - 1)) /
            kpisPerRow;

          for (const [kpiIndex, kpi] of expandedKpis.entries()) {
            const kpiColumn = kpiIndex % kpisPerRow;
            const kpiRow = Math.floor(kpiIndex / kpisPerRow);
            const nodeX = objectiveX + childIndent + kpiColumn * (kpiWidth + kpiGap);
            const nodeY = kpiY + kpiRow * (kpiNodeHeight + kpiRowGap);
            const boundedKpiWidth = Math.max(kpiMinWidth, kpiWidth);

            nodes.push({
              id: kpi.id,
              zIndex: nodeZIndex,
              position: {
                x: nodeX,
                y: nodeY,
              },
              targetPosition: Position.Top,
              connectable: false,
              selectable: false,
              draggable: false,
              style: {
                width: boundedKpiWidth,
                minHeight: kpiNodeHeight,
                border: "1px solid #0f766e",
                borderRadius: 10,
                background: "#ecfeff",
                fontSize: 11,
                lineHeight: 1.3,
                padding: "8px 10px",
                color: "#0f172a",
              },
              data: {
                label: kpi.label,
              },
            });

            edges.push({
              id: `tree:${kpi.parentInitiativeId}->${kpi.id}`,
              source: kpi.parentInitiativeId,
              target: kpi.id,
              type: "smoothstep",
              zIndex: connectorZIndex,
              interactionWidth: 12,
              selectable: false,
              style: {
                stroke: "#0f766e",
                strokeWidth: 1.4,
                strokeDasharray: "4 4",
              },
            });
          }
        }
      }
    }

    laneY += laneHeight + laneGap;
  }

  const resolveNodeId = (
    ref: ScorecardRelationship["source"],
  ): string | null => {
    if (ref.level === "objective") {
      if (!ref.objectiveDescription) {
        return null;
      }

      return (
        objectiveIdByKey.get(
          `${ref.perspectiveLevel}|${slug(ref.objectiveDescription)}`,
        ) ?? null
      );
    }

    return null;
  };

  for (const relationship of relationships) {
    const sourceId = resolveNodeId(relationship.source);
    const targetId = resolveNodeId(relationship.target);

    if (!sourceId || !targetId || sourceId === targetId) {
      continue;
    }

    const sourceBox = objectiveBoxByNodeId.get(sourceId);
    const targetBox = objectiveBoxByNodeId.get(targetId);
    const handles =
      sourceBox != null && targetBox != null
        ? resolveHandles(sourceBox, targetBox)
        : { sourceHandle: "source-top", targetHandle: "target-top" };

    const fanOutKey = `${sourceId}:${handles.sourceHandle}`;
    const fanInKey = `${targetId}:${handles.targetHandle}`;
    const fanOutIndex = fanOutCounts.get(fanOutKey) ?? 0;
    const fanInIndex = fanInCounts.get(fanInKey) ?? 0;
    fanOutCounts.set(fanOutKey, fanOutIndex + 1);
    fanInCounts.set(fanInKey, fanInIndex + 1);
    const routedOffset = 16 + fanOutIndex * 18 + fanInIndex * 12;

    let viaX: number | undefined;
    let viaY: number | undefined;
    const sourceLevel = relationship.source.perspectiveLevel;
    const targetLevel = relationship.target.perspectiveLevel;
    const sourceLane = laneBoundsByLevel.get(sourceLevel);
    const targetLane = laneBoundsByLevel.get(targetLevel);

    const xBounds = Array.from(objectiveBoxByNodeId.values()).reduce(
      (acc, box) => ({
        minX: Math.min(acc.minX, box.x),
        maxX: Math.max(acc.maxX, box.x + box.width),
      }),
      { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY },
    );

    if (
      sourceBox != null &&
      targetBox != null &&
      sourceLane != null &&
      targetLane != null &&
      Number.isFinite(xBounds.minX) &&
      Number.isFinite(xBounds.maxX)
    ) {
      if (sourceLevel === targetLevel) {
        const routeAbove = sourceLane.top - (44 + routedOffset);
        const routeBelow = sourceLane.bottom + (44 + routedOffset);
        const aboveCost =
          Math.abs(sourceBox.y - routeAbove) +
          Math.abs(targetBox.y - routeAbove);
        const belowCost =
          Math.abs(sourceBox.y - routeBelow) +
          Math.abs(targetBox.y - routeBelow);
        viaY = aboveCost <= belowCost ? routeAbove : routeBelow;
      } else {
        const leftRoute = xBounds.minX - (76 + routedOffset);
        const rightRoute = xBounds.maxX + (76 + routedOffset);
        const sourceCenterX = sourceBox.x + sourceBox.width / 2;
        const targetCenterX = targetBox.x + targetBox.width / 2;
        const leftCost =
          Math.abs(sourceCenterX - leftRoute) +
          Math.abs(targetCenterX - leftRoute);
        const rightCost =
          Math.abs(sourceCenterX - rightRoute) +
          Math.abs(targetCenterX - rightRoute);
        viaX = rightCost <= leftCost ? rightRoute : leftRoute;
      }
    }

    edges.push({
      id: `rel:${relationship.id}`,
      source: sourceId,
      target: targetId,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      type: "relationshipEdge",
      data: {
        routeOffset: routedOffset,
        viaX,
        viaY,
      },
      animated: true,
      zIndex: connectorZIndex,
      interactionWidth: 48,
      style: {
        stroke: RELATION_COLOR[relationship.relationshipType],
        strokeWidth: 3,
        strokeDasharray: "10 8",
      },
      label: RELATION_LABEL[relationship.relationshipType],
      labelStyle: {
        fill: "#0f172a",
        fontWeight: 700,
        fontSize: 11,
      },
      labelBgStyle: {
        fill: "#ffffff",
        fillOpacity: 0.95,
      },
    });
  }

  return { nodes, edges, nodeRefByNodeId };
};

export default function ScorecardStrategyMap({
  rows,
  relationships = [],
  hierarchyByPerspective = null,
  onCreateRelationship,
}: {
  rows: ScorecardInputRow[];
  relationships?: ScorecardRelationship[];
  hierarchyByPerspective?: StrategyMapHierarchy | null;
  onCreateRelationship?: (
    input: Omit<ScorecardRelationship, "id">,
  ) => void | Promise<void>;
}) {
  const [expandedObjectiveIds, setExpandedObjectiveIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [expandedInitiativeIds, setExpandedInitiativeIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const model = useMemo(
    () =>
      buildModel(
        rows,
        relationships,
        hierarchyByPerspective,
        expandedObjectiveIds,
        expandedInitiativeIds,
      ),
    [
      rows,
      relationships,
      hierarchyByPerspective,
      expandedObjectiveIds,
      expandedInitiativeIds,
    ],
  );
  const [newRelationType, setNewRelationType] =
    useState<ScorecardRelationship["relationshipType"]>("influences");
  const [connectionMessage, setConnectionMessage] = useState<string | null>(
    null,
  );

  const hasHierarchyData =
    hierarchyByPerspective != null &&
    Object.values(hierarchyByPerspective).some(
      (objectives) => objectives.length > 0,
    );

  if (rows.length === 0 && !hasHierarchyData) {
    return (
      <Card>
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-sm font-normal">
            BSC Strategy Map
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2 text-sm text-muted-foreground">
          No objectives are available for the selected context.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-sm font-normal">BSC Strategy Map</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="mb-2 rounded-md border bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          Swimlanes are perspectives. Only objective nodes are linkable.
          Existing BSC relationships are shown as colored links, and you can
          drag-connect objective nodes to add additional links. Click an
          objective node to expand or collapse its initiatives and KPIs.
        </div>

        <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
          Relationship direction rules: same-swimlane links are allowed, and
          cross-swimlane links must flow upward only (Development to Operations
          to Customer to Financial). Downward links are blocked.
        </div>

        {connectionMessage ? (
          <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            {connectionMessage}
          </div>
        ) : null}

        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-white px-3 py-2 text-[11px] text-slate-700">
          <span className="font-semibold">Relationship Type</span>
          <div className="w-48">
            <Select
              value={newRelationType}
              onValueChange={(value) =>
                setNewRelationType(
                  value as ScorecardRelationship["relationshipType"],
                )
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select relationship" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="influences">Influences</SelectItem>
                <SelectItem value="depends_on">Depends on</SelectItem>
                <SelectItem value="contributes_to">Contributes to</SelectItem>
                <SelectItem value="blocks">Blocks</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <span className="ml-2 font-semibold">Legend</span>
          {(
            ["influences", "depends_on", "contributes_to", "blocks"] as const
          ).map((type) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]"
            >
              <span
                className="h-[2px] w-5"
                style={{
                  backgroundColor: RELATION_COLOR[type],
                  borderTop:
                    RELATION_DASH[type] != null
                      ? `2px dashed ${RELATION_COLOR[type]}`
                      : "none",
                }}
              />
              {RELATION_LABEL[type]}
            </span>
          ))}
        </div>

        <div className="h-[72vh] min-h-[680px] w-full overflow-hidden rounded-md border bg-white">
          <ReactFlow
            nodes={model.nodes}
            edges={model.edges}
            onConnect={(connection: Connection) => {
              if (connection.source == null || connection.target == null) {
                return;
              }

              const sourceRef = model.nodeRefByNodeId.get(connection.source);
              const targetRef = model.nodeRefByNodeId.get(connection.target);

              if (sourceRef == null || targetRef == null) {
                return;
              }

              const isDownwardDirection =
                sourceRef.perspectiveLevel < targetRef.perspectiveLevel;

              if (isDownwardDirection) {
                setConnectionMessage(
                  "Blocked: relationships can only go upward (or within the same swimlane).",
                );
                return;
              }

              setConnectionMessage(null);

              void onCreateRelationship?.({
                source: sourceRef,
                target: targetRef,
                relationshipType: newRelationType,
              });
            }}
            onNodeClick={(_, node) => {
              if (!node.id.startsWith("objective:")) {
                if (!node.id.startsWith("initiative:")) {
                  return;
                }

                setExpandedInitiativeIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) {
                    next.delete(node.id);
                  } else {
                    next.add(node.id);
                  }

                  return next;
                });

                return;
              }

              setExpandedObjectiveIds((prev) => {
                const next = new Set(prev);
                if (next.has(node.id)) {
                  next.delete(node.id);
                  setExpandedInitiativeIds((initiativePrev) => {
                    const initiativeNext = new Set<string>();
                    for (const id of initiativePrev) {
                      if (!id.startsWith(`initiative:${node.id}:`)) {
                        initiativeNext.add(id);
                      }
                    }

                    return initiativeNext;
                  });
                } else {
                  next.add(node.id);
                }

                return next;
              });
            }}
            fitView
            fitViewOptions={{ padding: 0.08 }}
            minZoom={0.3}
            maxZoom={1.8}
            nodesDraggable
            nodesConnectable
            elementsSelectable
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              color="#d4d4d8"
              gap={20}
              size={1}
            />
            <Controls position="bottom-right" />
          </ReactFlow>
        </div>

        <style
          jsx
          global
        >{`
          .react-flow__node {
            transition:
              transform 120ms ease,
              box-shadow 120ms ease;
          }

          .react-flow__node:hover {
            transform: translateY(-1px);
          }

          .react-flow__node.selected,
          .react-flow__node:focus-visible {
            outline: 3px solid #0f172a;
            outline-offset: 2px;
          }

          .react-flow__handle {
            width: 12px;
            height: 12px;
            border: 3px solid #0f172a;
            background: #ffffff;
          }

          .react-flow__controls-button {
            width: 34px;
            height: 34px;
          }
        `}</style>
      </CardContent>
    </Card>
  );
}
