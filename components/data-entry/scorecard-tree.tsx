"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  ScorecardInputRow,
  ScorecardRelationship,
} from "@/app/data-entry/balanced-scorecard/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type InitiativeGroup = {
  name: string;
  kpis: ScorecardInputRow[];
};

type ObjectiveGroup = {
  name: string;
  initiatives: InitiativeGroup[];
};

type PerspectiveGroup = {
  level: 1 | 2 | 3 | 4;
  label: string;
  objectives: ObjectiveGroup[];
};

type MapModel = {
  nodes: Node[];
  edges: Edge[];
};

const DEFAULT_PERSPECTIVES: Array<{ level: 1 | 2 | 3 | 4; label: string }> = [
  { level: 1, label: "Financial" },
  { level: 2, label: "Customer" },
  { level: 3, label: "Operation" },
  { level: 4, label: "Development" },
];

const LANE_ACCENT: Record<1 | 2 | 3 | 4, string> = {
  1: "#f59e0b",
  2: "#22c55e",
  3: "#0284c7",
  4: "#dc2626",
};

const PERSPECTIVE_TITLE_BG: Record<1 | 2 | 3 | 4, string> = {
  1: "#fff7ed",
  2: "#ecfdf5",
  3: "#eff6ff",
  4: "#fef2f2",
};

const HIERARCHY_NODE_STYLE = {
  objective: {
    border: "#3b82f6",
    background: "#eff6ff",
  },
  initiative: {
    border: "#7c3aed",
    background: "#f5f3ff",
  },
  kpi: {
    border: "#0d9488",
    background: "#f0fdfa",
  },
} as const;

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const toKpiName = (row: ScorecardInputRow): string =>
  row.kpiName?.trim() || `KPI #${row.kpiDefinitionId}`;

const statusLabel = (status: ScorecardInputRow["status"] | null): string => {
  if (status === "on_track") {
    return "On track";
  }

  if (status === "at_risk") {
    return "At risk";
  }

  if (status === "off_track") {
    return "Off track";
  }

  return "N/A";
};

const displayValue = (value: number | null): string =>
  value == null ? "N/A" : String(value);

const statusClassName = (
  status: ScorecardInputRow["status"] | null,
): string => {
  if (status === "on_track") {
    return "font-semibold text-lime-700";
  }

  if (status === "at_risk") {
    return "font-semibold text-amber-700";
  }

  if (status === "off_track") {
    return "font-semibold text-rose-700";
  }

  return "font-semibold text-slate-500";
};

const asNumber = (value: number | null): number | null => {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  return value;
};

const actualValueClassName = (row: ScorecardInputRow): string => {
  const target = asNumber(row.targetValue);
  const actual = asNumber(row.actualValue);

  if (actual == null) {
    return "font-semibold text-slate-500";
  }

  if (target == null) {
    return "font-semibold text-sky-700";
  }

  return actual >= target
    ? "font-semibold text-lime-700"
    : "font-semibold text-rose-700";
};

const kpiNodeLabel = (row: ScorecardInputRow): ReactNode => (
  <div className="px-2 py-1.5 text-left">
    <div className="text-[13px] font-semibold leading-tight">
      {toKpiName(row)}
    </div>
    <div className="mt-0.5 text-[12px] leading-tight">
      Status:{" "}
      <span className={statusClassName(row.status)}>
        {statusLabel(row.status)}
      </span>
    </div>
    <div className="text-[12px] leading-tight">
      Target:{" "}
      <span className="font-semibold text-sky-700">
        {displayValue(row.targetValue)}
      </span>{" "}
      | Actual:{" "}
      <span className={actualValueClassName(row)}>
        {displayValue(row.actualValue)}
      </span>
    </div>
  </div>
);

const relationColor = (
  type: ScorecardRelationship["relationshipType"],
): string => {
  if (type === "depends_on") {
    return "#f59e0b";
  }

  if (type === "contributes_to") {
    return "#22c55e";
  }

  if (type === "blocks") {
    return "#ef4444";
  }

  return "#9ca3af";
};

const relationLabel = (
  type: ScorecardRelationship["relationshipType"],
): string => {
  if (type === "depends_on") {
    return "Depends on";
  }

  if (type === "contributes_to") {
    return "Contributes to";
  }

  if (type === "blocks") {
    return "Blocks";
  }

  return "Influences";
};

const isMovableNode = (nodeId: string): boolean =>
  nodeId.startsWith("perspective:") ||
  nodeId.startsWith("objective:") ||
  nodeId.startsWith("initiative:") ||
  nodeId.startsWith("kpi:");

const perspectiveLevelFromNodeId = (nodeId: string): 1 | 2 | 3 | 4 | null => {
  const [, rawLevel] = nodeId.split(":", 3);
  const level = Number(rawLevel);

  if (level === 1 || level === 2 || level === 3 || level === 4) {
    return level;
  }

  return null;
};

const styleNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const groupRows = (rows: ScorecardInputRow[]): PerspectiveGroup[] => {
  const byLevel = new Map<
    1 | 2 | 3 | 4,
    { label: string; rows: ScorecardInputRow[] }
  >();

  for (const row of rows) {
    const level = row.perspectiveLevel as 1 | 2 | 3 | 4;
    const existing = byLevel.get(level);
    if (existing) {
      existing.rows.push(row);
      continue;
    }

    byLevel.set(level, {
      label: row.perspectiveLabel,
      rows: [row],
    });
  }

  return DEFAULT_PERSPECTIVES.map((base) => {
    const source = byLevel.get(base.level);
    const perspectiveRows = source?.rows ?? [];

    const objectiveMap = new Map<string, ScorecardInputRow[]>();
    for (const row of perspectiveRows) {
      const objective = row.objective?.trim() || "Unassigned objective";
      const bucket = objectiveMap.get(objective) ?? [];
      bucket.push(row);
      objectiveMap.set(objective, bucket);
    }

    const objectives = [...objectiveMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([objectiveName, objectiveRows]) => {
        const initiativeMap = new Map<string, ScorecardInputRow[]>();

        for (const row of objectiveRows) {
          const initiative =
            row.keyInitiative?.trim() || "Unassigned initiative";
          const bucket = initiativeMap.get(initiative) ?? [];
          bucket.push(row);
          initiativeMap.set(initiative, bucket);
        }

        const initiatives = [...initiativeMap.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([initiativeName, initiativeRows]) => ({
            name: initiativeName,
            kpis: initiativeRows
              .slice()
              .sort((a, b) => toKpiName(a).localeCompare(toKpiName(b))),
          }));

        return {
          name: objectiveName,
          initiatives,
        };
      });

    return {
      level: base.level,
      label: source?.label ?? base.label,
      objectives,
    };
  });
};

const buildMapModel = (
  rows: ScorecardInputRow[],
  relationships: ScorecardRelationship[],
  expandedPerspectives: Set<1 | 2 | 3 | 4>,
  expandedObjectives: Set<string>,
  expandedInitiatives: Set<string>,
): MapModel => {
  const perspectives = groupRows(rows);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const perspectiveIdByLevel = new Map<number, string>();
  const objectiveIdByKey = new Map<string, string>();
  const initiativeIdByKey = new Map<string, string>();
  const kpiIdByKey = new Map<string, string>();

  const objectiveStartY = 70;
  const objectiveStepY = 92;
  const objectiveNodeHeight = 72;
  const initiativeStartY = 70;
  const initiativeStepY = 92;
  const initiativeNodeHeight = 72;
  const kpiStartY = 70;
  const kpiStepY = 118;
  const kpiNodeHeight = 96;
  const bottomPadding = 24;

  const requiredHeight = (
    count: number,
    startY: number,
    stepY: number,
    nodeHeight: number,
  ): number => {
    if (count <= 0) {
      return 0;
    }

    return startY + (count - 1) * stepY + nodeHeight;
  };

  const cardWidth = 1680;
  const cardGapY = 30;

  const perspectiveCardHeights = perspectives.map((perspective) => {
    if (!expandedPerspectives.has(perspective.level)) {
      return 150;
    }

    const objectiveCount = perspective.objectives.length;
    let initiativeCount = 0;
    let kpiCount = 0;

    for (const objective of perspective.objectives) {
      const objectiveId = `objective:${perspective.level}:${slug(objective.name)}`;
      if (!expandedObjectives.has(objectiveId)) {
        continue;
      }

      initiativeCount += objective.initiatives.length;

      for (const initiative of objective.initiatives) {
        const initiativeId = `initiative:${perspective.level}:${slug(objective.name)}:${slug(initiative.name)}`;
        if (!expandedInitiatives.has(initiativeId)) {
          continue;
        }

        kpiCount += initiative.kpis.length;
      }
    }

    const objectiveHeight = requiredHeight(
      objectiveCount,
      objectiveStartY,
      objectiveStepY,
      objectiveNodeHeight,
    );
    const initiativeHeight = requiredHeight(
      initiativeCount,
      initiativeStartY,
      initiativeStepY,
      initiativeNodeHeight,
    );
    const kpiHeight = requiredHeight(
      kpiCount,
      kpiStartY,
      kpiStepY,
      kpiNodeHeight,
    );

    const contentHeight = Math.max(
      130,
      objectiveHeight,
      initiativeHeight,
      kpiHeight,
    );

    return contentHeight + bottomPadding;
  });

  let currentY = 0;

  for (const [index, perspective] of perspectives.entries()) {
    const laneHeight = perspectiveCardHeights[index] ?? 300;
    const laneTop = currentY;
    const laneLeft = 0;

    const xLane = laneLeft + 20;
    const xObjective = laneLeft + 220;
    const xInitiative = laneLeft + 660;
    const xKpi = laneLeft + 1100;

    const perspectiveNodeId = `perspective:${perspective.level}`;
    perspectiveIdByLevel.set(perspective.level, perspectiveNodeId);

    nodes.push({
      id: `lane:${perspective.level}`,
      position: { x: laneLeft, y: laneTop },
      data: { label: "" },
      draggable: false,
      selectable: false,
      style: {
        width: cardWidth,
        height: laneHeight,
        border: "none",
        borderRadius: 0,
        background: "transparent",
      },
    });

    nodes.push({
      id: `lane-accent:${perspective.level}`,
      position: { x: laneLeft, y: laneTop },
      data: { label: "" },
      draggable: false,
      selectable: false,
      style: {
        width: cardWidth,
        height: 0,
        border: "none",
        borderRadius: 0,
        background: "transparent",
      },
    });

    nodes.push({
      id: perspectiveNodeId,
      position: { x: xLane, y: laneTop + 20 },
      data: { label: perspective.label },
      draggable: false,
      selectable: false,
      style: {
        width: "fit-content",
        maxWidth: 320,
        border: `2px solid ${LANE_ACCENT[perspective.level]}`,
        borderRadius: 999,
        background: PERSPECTIVE_TITLE_BG[perspective.level],
        fontWeight: 700,
        fontSize: 20,
        lineHeight: 1.2,
        color: "#111827",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "8px 16px",
        whiteSpace: "normal",
      },
    });

    if (!expandedPerspectives.has(perspective.level)) {
      currentY += laneHeight + cardGapY;
      continue;
    }

    let objectiveIndex = 0;
    let initiativeIndex = 0;
    let kpiIndex = 0;

    for (const objective of perspective.objectives) {
      const objectiveId = `objective:${perspective.level}:${slug(objective.name)}`;
      objectiveIdByKey.set(
        `${perspective.level}|${slug(objective.name)}`,
        objectiveId,
      );

      const objectiveY =
        laneTop + objectiveStartY + objectiveIndex * objectiveStepY;
      objectiveIndex += 1;

      nodes.push({
        id: objectiveId,
        position: { x: xObjective, y: objectiveY },
        data: { label: objective.name },
        draggable: false,
        style: {
          width: "fit-content",
          maxWidth: 430,
          borderRadius: 999,
          border: `2px solid ${HIERARCHY_NODE_STYLE.objective.border}`,
          background: HIERARCHY_NODE_STYLE.objective.background,
          textAlign: "center",
          fontWeight: 600,
          fontSize: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 14px",
          lineHeight: 1.3,
          whiteSpace: "normal",
          wordBreak: "break-word",
          cursor: "pointer",
        },
      });

      edges.push({
        id: `contain:${perspectiveNodeId}:${objectiveId}`,
        source: perspectiveNodeId,
        target: objectiveId,
        animated: false,
        type: "smoothstep",
        label: "Objective",
        style: { stroke: "#3b82f6", strokeWidth: 2.4 },
        labelStyle: {
          fill: "#1e3a8a",
          fontWeight: 600,
          fontSize: 11,
        },
        labelBgStyle: {
          fill: "#ffffff",
          fillOpacity: 0.9,
        },
        labelBgPadding: [5, 2],
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#3b82f6",
        },
        data: {
          isStructure: true,
          structureType: "objective",
        },
      });

      if (!expandedObjectives.has(objectiveId)) {
        continue;
      }

      for (const initiative of objective.initiatives) {
        const initiativeId = `initiative:${perspective.level}:${slug(objective.name)}:${slug(initiative.name)}`;
        initiativeIdByKey.set(
          `${perspective.level}|${slug(objective.name)}|${slug(initiative.name)}`,
          initiativeId,
        );

        const initiativeY =
          laneTop + initiativeStartY + initiativeIndex * initiativeStepY;
        initiativeIndex += 1;

        nodes.push({
          id: initiativeId,
          position: { x: xInitiative, y: initiativeY },
          data: { label: initiative.name },
          draggable: false,
          style: {
            width: "fit-content",
            maxWidth: 430,
            borderRadius: 999,
            border: `2px solid ${HIERARCHY_NODE_STYLE.initiative.border}`,
            background: HIERARCHY_NODE_STYLE.initiative.background,
            textAlign: "center",
            fontWeight: 600,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 14px",
            lineHeight: 1.3,
            whiteSpace: "normal",
            wordBreak: "break-word",
            cursor: "pointer",
          },
        });

        edges.push({
          id: `contain:${objectiveId}:${initiativeId}`,
          source: objectiveId,
          target: initiativeId,
          animated: false,
          type: "bezier",
          label: "Initiative",
          style: { stroke: "#7c3aed", strokeWidth: 2.4 },
          labelStyle: {
            fill: "#4c1d95",
            fontWeight: 600,
            fontSize: 11,
          },
          labelBgStyle: {
            fill: "#ffffff",
            fillOpacity: 0.9,
          },
          labelBgPadding: [5, 2],
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#7c3aed",
          },
          data: {
            isStructure: true,
            structureType: "initiative",
          },
        });

        if (!expandedInitiatives.has(initiativeId)) {
          continue;
        }

        for (const row of initiative.kpis) {
          const kpiId = `kpi:${perspective.level}:${slug(objective.name)}:${slug(initiative.name)}:${row.kpiDefinitionId}:${row.kpiId}`;
          kpiIdByKey.set(
            `${perspective.level}|${slug(objective.name)}|${slug(initiative.name)}|${row.kpiDefinitionId}`,
            kpiId,
          );

          const kpiY = laneTop + kpiStartY + kpiIndex * kpiStepY;
          kpiIndex += 1;

          nodes.push({
            id: kpiId,
            position: { x: xKpi, y: kpiY },
            data: { label: kpiNodeLabel(row) },
            draggable: false,
            style: {
              width: "fit-content",
              maxWidth: 560,
              borderRadius: 999,
              border: `2px solid ${HIERARCHY_NODE_STYLE.kpi.border}`,
              background: HIERARCHY_NODE_STYLE.kpi.background,
              textAlign: "left",
              color: "#111827",
              fontWeight: 500,
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              padding: "8px 14px",
            },
          });

          edges.push({
            id: `contain:${initiativeId}:${kpiId}`,
            source: initiativeId,
            target: kpiId,
            animated: false,
            type: "bezier",
            label: "KPI",
            style: { stroke: "#0d9488", strokeWidth: 2.4 },
            labelStyle: {
              fill: "#115e59",
              fontWeight: 600,
              fontSize: 11,
            },
            labelBgStyle: {
              fill: "#ffffff",
              fillOpacity: 0.9,
            },
            labelBgPadding: [5, 2],
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#0d9488",
            },
            data: {
              isStructure: true,
              structureType: "kpi",
            },
          });
        }
      }
    }

    currentY += laneHeight + cardGapY;
  }

  const hierarchyFlow: Array<[1 | 2 | 3 | 4, 1 | 2 | 3 | 4]> = [
    [4, 3],
    [3, 2],
    [2, 1],
  ];

  for (const [fromLevel, toLevel] of hierarchyFlow) {
    const sourceId = perspectiveIdByLevel.get(fromLevel);
    const targetId = perspectiveIdByLevel.get(toLevel);

    if (!sourceId || !targetId) {
      continue;
    }

    edges.push({
      id: `hierarchy-flow:${fromLevel}->${toLevel}`,
      source: sourceId,
      target: targetId,
      type: "smoothstep",
      animated: true,
      label: "Hierarchy flow",
      style: {
        stroke: "#334155",
        strokeWidth: 2.8,
        strokeDasharray: "7 5",
      },
      labelStyle: {
        fill: "#0f172a",
        fontWeight: 600,
        fontSize: 12,
      },
      labelBgStyle: {
        fill: "#ffffff",
        fillOpacity: 0.95,
      },
      labelBgPadding: [6, 3],
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#334155",
      },
      data: {
        isHierarchyFlow: true,
      },
    });
  }

  const resolveNodeId = (
    ref: ScorecardRelationship["source"],
  ): string | null => {
    if (ref.level === "perspective") {
      return perspectiveIdByLevel.get(ref.perspectiveLevel) ?? null;
    }

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

    if (ref.level === "initiative") {
      if (!ref.objectiveDescription || !ref.keyInitiativeDescription) {
        return null;
      }

      return (
        initiativeIdByKey.get(
          `${ref.perspectiveLevel}|${slug(ref.objectiveDescription)}|${slug(ref.keyInitiativeDescription)}`,
        ) ?? null
      );
    }

    if (
      !ref.objectiveDescription ||
      !ref.keyInitiativeDescription ||
      ref.kpiId == null
    ) {
      return null;
    }

    return (
      kpiIdByKey.get(
        `${ref.perspectiveLevel}|${slug(ref.objectiveDescription)}|${slug(ref.keyInitiativeDescription)}|${ref.kpiId}`,
      ) ?? null
    );
  };

  for (const relationship of relationships) {
    const sourceId = resolveNodeId(relationship.source);
    const targetId = resolveNodeId(relationship.target);

    if (sourceId == null || targetId == null || sourceId === targetId) {
      continue;
    }

    edges.push({
      id: `rel:${relationship.id}`,
      source: sourceId,
      target: targetId,
      type: "bezier",
      animated: true,
      label: relationLabel(relationship.relationshipType),
      style: {
        stroke: relationColor(relationship.relationshipType),
        strokeWidth: 3.2,
        strokeDasharray: "10 6",
      },
      labelStyle: {
        fill: "#111827",
        fontWeight: 700,
        fontSize: 12,
      },
      labelBgStyle: {
        fill: "#ffffff",
        fillOpacity: 0.96,
      },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 6,
      zIndex: 100,
      interactionWidth: 40,
      data: {
        isRelationship: true,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: relationColor(relationship.relationshipType),
      },
    });
  }

  return { nodes, edges };
};

export default function ScorecardTree({
  rows,
  relationships = [],
}: {
  rows: ScorecardInputRow[];
  relationships?: ScorecardRelationship[];
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedPerspectives, setExpandedPerspectives] = useState<
    Set<1 | 2 | 3 | 4>
  >(new Set());
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(
    new Set(),
  );
  const [expandedInitiatives, setExpandedInitiatives] = useState<Set<string>>(
    new Set(),
  );
  const [manualPositions, setManualPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const model = useMemo(
    () =>
      buildMapModel(
        rows,
        relationships,
        expandedPerspectives,
        expandedObjectives,
        expandedInitiatives,
      ),
    [
      rows,
      relationships,
      expandedPerspectives,
      expandedObjectives,
      expandedInitiatives,
    ],
  );

  useEffect(() => {
    // Reset manual placement when source data changes materially.
    setManualPositions({});
    setSelectedNodeId(null);
    setExpandedPerspectives(new Set());
    setExpandedObjectives(new Set());
    setExpandedInitiatives(new Set());
  }, [rows, relationships]);

  const handleNodeClick = (nodeId: string) => {
    if (nodeId.startsWith("perspective:")) {
      const level = perspectiveLevelFromNodeId(nodeId);
      if (level != null) {
        setExpandedPerspectives((current) => {
          const next = new Set(current);
          if (next.has(level)) {
            next.delete(level);

            setExpandedObjectives((currentObjectives) => {
              const filtered = new Set<string>();
              for (const item of currentObjectives) {
                if (!item.startsWith(`objective:${level}:`)) {
                  filtered.add(item);
                }
              }
              return filtered;
            });

            setExpandedInitiatives((currentInitiatives) => {
              const filtered = new Set<string>();
              for (const item of currentInitiatives) {
                if (!item.startsWith(`initiative:${level}:`)) {
                  filtered.add(item);
                }
              }
              return filtered;
            });
          } else {
            next.add(level);
          }
          return next;
        });
      }
    } else if (nodeId.startsWith("objective:")) {
      setExpandedObjectives((current) => {
        const next = new Set(current);
        if (next.has(nodeId)) {
          next.delete(nodeId);

          const initiativePrefix = `${nodeId.replace(/^objective:/, "initiative:")}:`;
          setExpandedInitiatives((currentInitiatives) => {
            const filtered = new Set<string>();
            for (const item of currentInitiatives) {
              if (!item.startsWith(initiativePrefix)) {
                filtered.add(item);
              }
            }
            return filtered;
          });
        } else {
          next.add(nodeId);
        }
        return next;
      });
    } else if (nodeId.startsWith("initiative:")) {
      setExpandedInitiatives((current) => {
        const next = new Set(current);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
    }

    setSelectedNodeId((current) => (current === nodeId ? null : nodeId));
  };

  const interactiveModel = useMemo(() => {
    const baseNodes = model.nodes.map((node) => {
      const manualPosition = manualPositions[node.id];

      return {
        ...node,
        position: manualPosition ?? node.position,
        draggable: isMovableNode(node.id),
      };
    });

    const laneRectsByLevel = new Map<
      1 | 2 | 3 | 4,
      { x: number; y: number; width: number; height: number }
    >();

    for (const node of baseNodes) {
      if (!node.id.startsWith("lane:")) {
        continue;
      }

      const level = perspectiveLevelFromNodeId(node.id);
      if (level == null) {
        continue;
      }

      laneRectsByLevel.set(level, {
        x: node.position.x,
        y: node.position.y,
        width: styleNumber(node.style?.width, 0),
        height: styleNumber(node.style?.height, 0),
      });
    }

    const movableBoundsByLevel = new Map<
      1 | 2 | 3 | 4,
      { minX: number; minY: number; maxX: number; maxY: number }
    >();

    for (const node of baseNodes) {
      if (!isMovableNode(node.id)) {
        continue;
      }

      const level = perspectiveLevelFromNodeId(node.id);
      if (level == null) {
        continue;
      }

      const fallbackWidth = node.id.startsWith("kpi:")
        ? 360
        : node.id.startsWith("objective:") || node.id.startsWith("initiative:")
          ? 240
          : 180;

      const fallbackHeight = node.id.startsWith("kpi:") ? 84 : 48;

      const width = styleNumber(
        node.measured?.width ?? node.style?.width,
        fallbackWidth,
      );
      const height = styleNumber(
        node.measured?.height ?? node.style?.minHeight ?? node.style?.height,
        fallbackHeight,
      );

      const minX = node.position.x;
      const minY = node.position.y;
      const maxX = node.position.x + width;
      const maxY = node.position.y + height;

      const current = movableBoundsByLevel.get(level);
      if (!current) {
        movableBoundsByLevel.set(level, { minX, minY, maxX, maxY });
        continue;
      }

      current.minX = Math.min(current.minX, minX);
      current.minY = Math.min(current.minY, minY);
      current.maxX = Math.max(current.maxX, maxX);
      current.maxY = Math.max(current.maxY, maxY);
    }

    const expandedLaneRects = new Map<
      1 | 2 | 3 | 4,
      { x: number; y: number; width: number; height: number }
    >();

    for (const [level, laneRect] of laneRectsByLevel) {
      const bounds = movableBoundsByLevel.get(level);
      if (!bounds) {
        expandedLaneRects.set(level, laneRect);
        continue;
      }

      const minX = Math.min(laneRect.x, bounds.minX - 24);
      const minY = Math.min(laneRect.y, bounds.minY - 18);
      const maxX = Math.max(laneRect.x + laneRect.width, bounds.maxX + 24);
      const maxY = Math.max(laneRect.y + laneRect.height, bounds.maxY + 24);

      expandedLaneRects.set(level, {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      });
    }

    const defaultRect = { x: 0, y: 0, width: 0, height: 0 };
    const getExpandedRect = (level: 1 | 2 | 3 | 4) =>
      expandedLaneRects.get(level) ??
      laneRectsByLevel.get(level) ??
      defaultRect;

    const laneGapY = 30;

    const levels = [1, 2, 3, 4] as const;
    const leftEdge = Math.min(
      ...levels.map((level) => getExpandedRect(level).x),
    );
    const fullWidth = Math.max(
      ...levels.map(
        (level) =>
          getExpandedRect(level).x + getExpandedRect(level).width - leftEdge,
      ),
    );

    let packedY = Math.min(...levels.map((level) => getExpandedRect(level).y));

    const packedLaneRects = new Map<
      1 | 2 | 3 | 4,
      { x: number; y: number; width: number; height: number }
    >();

    for (const level of levels) {
      const rect = getExpandedRect(level);
      packedLaneRects.set(level, {
        x: leftEdge,
        y: packedY,
        width: fullWidth,
        height: rect.height,
      });

      packedY += rect.height + laneGapY;
    }

    const laneDeltaByLevel = new Map<
      1 | 2 | 3 | 4,
      { dx: number; dy: number }
    >();
    for (const level of levels) {
      const from = getExpandedRect(level);
      const to = packedLaneRects.get(level) ?? from;
      laneDeltaByLevel.set(level, {
        dx: to.x - from.x,
        dy: to.y - from.y,
      });
    }

    const nodes = baseNodes.map((node) => {
      const level = perspectiveLevelFromNodeId(node.id);
      if (level == null) {
        return node;
      }

      const packedRect = packedLaneRects.get(level);
      const laneDelta = laneDeltaByLevel.get(level) ?? { dx: 0, dy: 0 };

      if (!packedRect) {
        return node;
      }

      if (node.id.startsWith("lane-accent:")) {
        return {
          ...node,
          position: { x: packedRect.x, y: packedRect.y },
          style: {
            ...node.style,
            width: packedRect.width,
            height: 0,
          },
        };
      }

      if (node.id.startsWith("lane:")) {
        return {
          ...node,
          position: { x: packedRect.x, y: packedRect.y },
          style: {
            ...node.style,
            width: packedRect.width,
            height: packedRect.height,
          },
        };
      }

      if (isMovableNode(node.id)) {
        return {
          ...node,
          position: {
            x: node.position.x + laneDelta.dx,
            y: node.position.y + laneDelta.dy,
          },
        };
      }

      return {
        ...node,
        position: node.position,
      };
    });

    return {
      nodes,
      edges: model.edges,
    };
  }, [manualPositions, model.edges, model.nodes]);

  const highlightedModel = useMemo(() => {
    if (!selectedNodeId) {
      return interactiveModel;
    }

    const highlightableEdges = interactiveModel.edges.filter((edge) => {
      const edgeData = edge.data as
        | {
            isRelationship?: boolean;
            isHierarchyFlow?: boolean;
            isStructure?: boolean;
          }
        | undefined;
      return (
        edgeData?.isRelationship === true ||
        edgeData?.isHierarchyFlow === true ||
        edgeData?.isStructure === true
      );
    });

    const connectedHighlightableEdges = highlightableEdges.filter(
      (edge) =>
        edge.source === selectedNodeId || edge.target === selectedNodeId,
    );

    const connectedEdgeIds = new Set(
      connectedHighlightableEdges.map((edge) => edge.id),
    );

    const connectedNodeIds = new Set<string>([selectedNodeId]);
    for (const edge of connectedHighlightableEdges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }

    const nodes = interactiveModel.nodes.map((node) => {
      const isConnected = connectedNodeIds.has(node.id);
      const isSelected = node.id === selectedNodeId;

      return {
        ...node,
        style: {
          ...node.style,
          opacity: isConnected ? 1 : 0.3,
          boxShadow: isSelected
            ? "0 0 0 3px rgba(15, 23, 42, 0.35)"
            : isConnected
              ? "0 0 0 2px rgba(15, 23, 42, 0.2)"
              : "none",
        },
      };
    });

    const edges = interactiveModel.edges.map((edge) => {
      const isConnectedEdge = connectedEdgeIds.has(edge.id);
      const edgeData = edge.data as
        | {
            isRelationship?: boolean;
            isHierarchyFlow?: boolean;
            isStructure?: boolean;
          }
        | undefined;
      const isRelationshipLike =
        edgeData?.isRelationship === true || edgeData?.isHierarchyFlow === true;
      const isStructure = edgeData?.isStructure === true;

      if (isConnectedEdge) {
        return {
          ...edge,
          animated: true,
          zIndex: 200,
          style: {
            ...edge.style,
            opacity: 1,
            strokeWidth: Math.max(
              3.4,
              (Number(edge.style?.strokeWidth) || 0) + 0.8,
            ),
          },
          labelStyle: {
            ...edge.labelStyle,
            fontWeight: 800,
            fontSize: 13,
          },
        };
      }

      if (isRelationshipLike) {
        return {
          ...edge,
          animated: false,
          style: {
            ...edge.style,
            opacity: 0.12,
          },
          labelStyle: {
            ...edge.labelStyle,
            opacity: 0.2,
          },
          labelBgStyle: {
            ...edge.labelBgStyle,
            fillOpacity: 0.25,
          },
        };
      }

      if (isStructure) {
        return {
          ...edge,
          animated: false,
          style: {
            ...edge.style,
            opacity: 0.2,
          },
          labelStyle: {
            ...edge.labelStyle,
            opacity: 0.25,
          },
          labelBgStyle: {
            ...edge.labelBgStyle,
            fillOpacity: 0.25,
          },
        };
      }

      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: 0.1,
        },
      };
    });

    return { nodes, edges };
  }, [interactiveModel, selectedNodeId]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-sm font-normal">Strategic Map</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2 text-sm text-muted-foreground">
          No KPI nodes are available for the selected filter context.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-sm font-normal">Strategic Map</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="rounded-md border bg-[#d7d9dd]">
          <div className="border-b border-[#666] bg-[#1f2125] px-3 py-2 text-center text-[15px] font-semibold text-white">
            Transforming strategy into measurable outcomes through an
            interconnected scorecard
          </div>
          <div className="border-b border-[#666] bg-[#23262b] px-3 py-1.5 text-center text-[13px] text-white/90">
            Perspective flow: Financial {" -> "} Customer {" -> "} Internal
            Processes {" -> "} Organisational Capacity
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b border-[#666] bg-[#f3f4f6] px-4 py-2 text-[12px] text-slate-700">
            <span className="font-semibold">Edge Legend</span>
            <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]">
              Click perspective/objective/initiative to expand or collapse
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-5 bg-blue-500" />
              Objective link
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-5 bg-violet-600" />
              Initiative link
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-5 bg-teal-600" />
              KPI link
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-5 border-t-2 border-dashed border-slate-700" />
              Hierarchy flow
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-5 border-t-2 border-dashed border-lime-500" />
              Relationship
            </span>
          </div>
        </div>
        <div className="h-[min(72vh,68rem)] min-h-120 w-full overflow-hidden rounded-b-md border-x border-b border-[#b7bbc3] bg-[#d7d9dd] p-2">
          <ReactFlow
            nodes={highlightedModel.nodes}
            edges={highlightedModel.edges}
            fitView
            fitViewOptions={{ padding: 0.02 }}
            minZoom={0.28}
            maxZoom={1.8}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => handleNodeClick(node.id)}
            onNodeDragStop={(_, node) => {
              if (!isMovableNode(node.id)) {
                return;
              }

              setManualPositions((current) => ({
                ...current,
                [node.id]: { x: node.position.x, y: node.position.y },
              }));
            }}
            onPaneClick={() => setSelectedNodeId(null)}
          >
            <Controls
              showInteractive={false}
              position="bottom-right"
            />
          </ReactFlow>
        </div>
      </CardContent>
    </Card>
  );
}
