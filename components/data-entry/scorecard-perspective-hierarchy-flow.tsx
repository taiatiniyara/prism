"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  PerspectiveScore,
  ScorecardInputRow,
  ScorecardSnapshot,
} from "@/app/data-entry/balanced-scorecard/types";

type PerspectiveHierarchyFlowProps = {
  snapshot: ScorecardSnapshot | null;
  rows: ScorecardInputRow[];
  isLoading: boolean;
};

type PerspectiveLevel = 1 | 2 | 3 | 4;

type FlowNodeData = {
  label: ReactNode;
  accent: string;
};

type KpiItem = {
  id: string;
  row: ScorecardInputRow;
};

type InitiativeItem = {
  id: string;
  label: string;
  kpis: KpiItem[];
};

type ObjectiveItem = {
  id: string;
  label: string;
  initiatives: InitiativeItem[];
};

type PerspectiveItem = {
  id: string;
  level: PerspectiveLevel;
  label: string;
  objectives: ObjectiveItem[];
  score?: PerspectiveScore;
};

const DEFAULT_PERSPECTIVES: Array<{ level: PerspectiveLevel; label: string }> =
  [
    { level: 4, label: "Development" },
    { level: 3, label: "Operations" },
    { level: 2, label: "Customer" },
    { level: 1, label: "Financial" },
  ];

const ACCENT_BY_LEVEL: Record<PerspectiveLevel, string> = {
  1: "#f59e0b",
  2: "#22c55e",
  3: "#0ea5e9",
  4: "#ef4444",
};

const HIERARCHY_ACCENT = {
  perspective: "#1d4ed8",
  objective: "#7c3aed",
  initiative: "#0f766e",
  kpi: "#be123c",
} as const;

const HIERARCHY_BG = {
  perspective: "#eff6ff",
  objective: "#f5f3ff",
  initiative: "#ecfeff",
  kpi: "#fff1f2",
} as const;

const X_POSITION = {
  perspective: 40,
  objective: 420,
  initiative: 860,
  kpi: 1320,
};

const NODE_HEIGHT = {
  perspective: 112,
  objective: 90,
  initiative: 90,
  kpi: 106,
};

const LAYOUT_GAP = {
  kpi: 18,
  initiative: 28,
  objective: 36,
  perspective: 64,
};

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const clean = (value: string | null | undefined): string => value?.trim() ?? "";

const kpiName = (row: ScorecardInputRow): string => {
  const name = clean(row.kpiName);
  if (name.length > 0) {
    return name;
  }

  return `KPI #${row.kpiDefinitionId}`;
};

const statusLabel = (status: string | null): string => {
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

const displayMetric = (value: number | null): string => {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }

  return String(value);
};

const toScoreLabel = (value: number | null): string => {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value.toFixed(1)}%`;
};

const toPerspectiveMap = (
  scores: PerspectiveScore[] | undefined,
): Map<PerspectiveLevel, PerspectiveScore> => {
  const map = new Map<PerspectiveLevel, PerspectiveScore>();

  if (scores == null) {
    return map;
  }

  for (const score of scores) {
    if (
      score.perspectiveLevel === 1 ||
      score.perspectiveLevel === 2 ||
      score.perspectiveLevel === 3 ||
      score.perspectiveLevel === 4
    ) {
      map.set(score.perspectiveLevel, score);
    }
  }

  return map;
};

const asNodeData = (
  label: string,
  level: PerspectiveLevel,
  score: PerspectiveScore | undefined,
  objectiveCount: number,
  collapsed: boolean,
): FlowNodeData => {
  const weightedScore = toScoreLabel(score?.weightedScore ?? null);
  const included = score?.includedCount ?? 0;
  const excluded = score?.excludedCount ?? 0;
  const accent = ACCENT_BY_LEVEL[level];

  return {
    accent,
    label: (
      <div
        className="w-60 rounded-xl border p-3 text-left shadow-sm"
        style={{ backgroundColor: HIERARCHY_BG.perspective }}
      >
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">Level {level}</p>
        <p className="mt-1 text-[11px] text-slate-600">
          {objectiveCount} objective(s) •{" "}
          {collapsed ? "Click to expand" : "Click to collapse"}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <p className="text-slate-500">Score</p>
            <p className="font-semibold text-slate-900">{weightedScore}</p>
          </div>
          <div>
            <p className="text-slate-500">In</p>
            <p className="font-semibold text-emerald-700">{included}</p>
          </div>
          <div>
            <p className="text-slate-500">Out</p>
            <p className="font-semibold text-rose-700">{excluded}</p>
          </div>
        </div>
      </div>
    ),
  };
};

const asObjectiveNodeData = (
  _level: PerspectiveLevel,
  objectiveLabel: string,
  initiativeCount: number,
  kpiCount: number,
  collapsed: boolean,
): FlowNodeData => {
  const accent = HIERARCHY_ACCENT.objective;

  return {
    accent,
    label: (
      <div
        className="w-75 rounded-xl border p-3 text-left shadow-sm"
        style={{ backgroundColor: HIERARCHY_BG.objective }}
      >
        <p className="text-[12px] font-semibold text-slate-900">Objective</p>
        <p className="text-sm font-medium text-slate-800">{objectiveLabel}</p>
        <p className="mt-2 text-[11px] text-slate-500">
          {initiativeCount} initiative(s) • {kpiCount} KPI(s)
        </p>
        <p className="mt-1 text-[11px] text-slate-600">
          {collapsed ? "Click to expand" : "Click to collapse"}
        </p>
      </div>
    ),
  };
};

const asInitiativeNodeData = (
  _level: PerspectiveLevel,
  initiativeLabel: string,
  kpiCount: number,
  collapsed: boolean,
): FlowNodeData => {
  const accent = HIERARCHY_ACCENT.initiative;

  return {
    accent,
    label: (
      <div
        className="w-75 rounded-xl border p-3 text-left shadow-sm"
        style={{ backgroundColor: HIERARCHY_BG.initiative }}
      >
        <p className="text-[12px] font-semibold text-slate-900">Initiative</p>
        <p className="text-sm font-medium text-slate-800">{initiativeLabel}</p>
        <p className="mt-2 text-[11px] text-slate-500">{kpiCount} KPI(s)</p>
        <p className="mt-1 text-[11px] text-slate-600">
          {collapsed ? "Click to expand" : "Click to collapse"}
        </p>
      </div>
    ),
  };
};

const asKpiNodeData = (
  _level: PerspectiveLevel,
  row: ScorecardInputRow,
): FlowNodeData => {
  const accent = HIERARCHY_ACCENT.kpi;

  return {
    accent,
    label: (
      <div
        className="w-80 rounded-xl border p-3 text-left shadow-sm"
        style={{ backgroundColor: HIERARCHY_BG.kpi }}
      >
        <p className="text-[12px] font-semibold text-slate-900">KPI</p>
        <p className="text-sm font-medium text-slate-800">{kpiName(row)}</p>
        <p className="mt-2 text-[11px] text-slate-600">
          Status: <span className="font-medium">{statusLabel(row.status)}</span>
        </p>
        <p className="text-[11px] text-slate-600">
          Target:{" "}
          <span className="font-medium">{displayMetric(row.targetValue)}</span>
          {"  "}
          Actual:{" "}
          <span className="font-medium">{displayMetric(row.actualValue)}</span>
        </p>
      </div>
    ),
  };
};

const edgeStyle = (
  hierarchy: keyof typeof HIERARCHY_ACCENT,
  level?: PerspectiveLevel,
) => ({
  stroke:
    hierarchy === "perspective" && level != null
      ? ACCENT_BY_LEVEL[level]
      : HIERARCHY_ACCENT[hierarchy],
  strokeWidth: 2,
});

const NODE_WRAPPER_STYLE = {
  background: "transparent",
  border: "none",
  padding: 0,
  boxShadow: "none",
};

const asPerspectiveLevel = (value: number): PerspectiveLevel | null => {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }

  return null;
};

const buildHierarchy = (
  rows: ScorecardInputRow[],
  snapshot: ScorecardSnapshot | null,
): PerspectiveItem[] => {
  const byLevel = toPerspectiveMap(snapshot?.perspectiveScores);
  const rowsByPerspective = new Map<PerspectiveLevel, ScorecardInputRow[]>();

  for (const row of rows) {
    const level = asPerspectiveLevel(row.perspectiveLevel);
    if (level == null) {
      continue;
    }

    const bucket = rowsByPerspective.get(level);
    if (bucket == null) {
      rowsByPerspective.set(level, [row]);
    } else {
      bucket.push(row);
    }
  }

  return DEFAULT_PERSPECTIVES.map((perspective) => {
    const perspectiveRows = rowsByPerspective.get(perspective.level) ?? [];
    const perspectiveLabel =
      clean(perspectiveRows[0]?.perspectiveLabel) || perspective.label;

    const objectiveGroups = new Map<string, ScorecardInputRow[]>();
    for (const row of perspectiveRows) {
      const objectiveName = clean(row.objective) || "Unassigned Objective";
      const bucket = objectiveGroups.get(objectiveName);
      if (bucket == null) {
        objectiveGroups.set(objectiveName, [row]);
      } else {
        bucket.push(row);
      }
    }

    const objectives: ObjectiveItem[] = Array.from(objectiveGroups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([objectiveLabel, objectiveRows], objectiveIndex) => {
        const objectiveId = `objective:${perspective.level}:${slug(objectiveLabel)}:${objectiveIndex}`;

        const initiativeGroups = new Map<string, ScorecardInputRow[]>();
        for (const row of objectiveRows) {
          const initiativeName =
            clean(row.keyInitiative) || "Unassigned Initiative";
          const bucket = initiativeGroups.get(initiativeName);
          if (bucket == null) {
            initiativeGroups.set(initiativeName, [row]);
          } else {
            bucket.push(row);
          }
        }

        const initiatives: InitiativeItem[] = Array.from(
          initiativeGroups.entries(),
        )
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([initiativeLabel, initiativeRows], initiativeIndex) => {
            const initiativeId = `initiative:${perspective.level}:${slug(objectiveLabel)}:${slug(initiativeLabel)}:${initiativeIndex}`;

            const uniqueKpis = new Map<string, ScorecardInputRow>();
            for (const row of initiativeRows) {
              const key = `${row.kpiDefinitionId}:${row.kpiId}:${clean(row.kpiName)}`;
              if (!uniqueKpis.has(key)) {
                uniqueKpis.set(key, row);
              }
            }

            const kpis: KpiItem[] = Array.from(uniqueKpis.values())
              .sort((a, b) => kpiName(a).localeCompare(kpiName(b)))
              .map((row, kpiIndex) => ({
                id: `kpi:${perspective.level}:${row.kpiDefinitionId}:${kpiIndex}:${objectiveIndex}:${initiativeIndex}`,
                row,
              }));

            return {
              id: initiativeId,
              label: initiativeLabel,
              kpis,
            };
          });

        return {
          id: objectiveId,
          label: objectiveLabel,
          initiatives,
        };
      });

    return {
      id: `perspective:${perspective.level}`,
      level: perspective.level,
      label: perspectiveLabel,
      objectives,
      score: byLevel.get(perspective.level),
    };
  });
};

const initiativeBlockHeight = (
  initiative: InitiativeItem,
  collapsed: Set<string>,
): number => {
  if (collapsed.has(initiative.id) || initiative.kpis.length === 0) {
    return NODE_HEIGHT.initiative;
  }

  const kpiStackHeight =
    initiative.kpis.length * NODE_HEIGHT.kpi +
    Math.max(0, initiative.kpis.length - 1) * LAYOUT_GAP.kpi;

  return Math.max(NODE_HEIGHT.initiative, kpiStackHeight);
};

const objectiveBlockHeight = (
  objective: ObjectiveItem,
  collapsed: Set<string>,
): number => {
  if (collapsed.has(objective.id) || objective.initiatives.length === 0) {
    return NODE_HEIGHT.objective;
  }

  const childrenHeight = objective.initiatives.reduce((sum, initiative) => {
    return sum + initiativeBlockHeight(initiative, collapsed);
  }, 0);

  const gaps =
    Math.max(0, objective.initiatives.length - 1) * LAYOUT_GAP.initiative;
  return Math.max(NODE_HEIGHT.objective, childrenHeight + gaps);
};

const perspectiveBlockHeight = (
  perspective: PerspectiveItem,
  collapsed: Set<string>,
): number => {
  if (collapsed.has(perspective.id) || perspective.objectives.length === 0) {
    return NODE_HEIGHT.perspective;
  }

  const childrenHeight = perspective.objectives.reduce((sum, objective) => {
    return sum + objectiveBlockHeight(objective, collapsed);
  }, 0);

  const gaps =
    Math.max(0, perspective.objectives.length - 1) * LAYOUT_GAP.objective;
  return Math.max(NODE_HEIGHT.perspective, childrenHeight + gaps);
};

const isCollapsibleNode = (nodeId: string): boolean => {
  return (
    nodeId.startsWith("perspective:") ||
    nodeId.startsWith("objective:") ||
    nodeId.startsWith("initiative:")
  );
};

export default function ScorecardPerspectiveHierarchyFlow({
  snapshot,
  rows,
  isLoading,
}: PerspectiveHierarchyFlowProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(
    () => new Set<string>(),
  );

  const model = useMemo(() => {
    const hierarchy = buildHierarchy(rows, snapshot);

    const nodes: Node<FlowNodeData>[] = [];
    const edges: Edge[] = [];

    let yCursor = 40;

    for (const perspective of hierarchy) {
      const perspectiveCollapsed = collapsedNodes.has(perspective.id);
      const perspectiveHeight = perspectiveBlockHeight(
        perspective,
        collapsedNodes,
      );
      const perspectiveY =
        yCursor + (perspectiveHeight - NODE_HEIGHT.perspective) / 2;

      nodes.push({
        id: perspective.id,
        position: {
          x: X_POSITION.perspective,
          y: perspectiveY,
        },
        style: NODE_WRAPPER_STYLE,
        draggable: true,
        selectable: false,
        sourcePosition: Position.Right,
        data: asNodeData(
          perspective.label,
          perspective.level,
          perspective.score,
          perspective.objectives.length,
          perspectiveCollapsed,
        ),
      });

      if (perspectiveCollapsed || perspective.objectives.length === 0) {
        yCursor += perspectiveHeight + LAYOUT_GAP.perspective;
        continue;
      }

      let objectiveCursor = yCursor;
      for (const objective of perspective.objectives) {
        const objectiveCollapsed = collapsedNodes.has(objective.id);
        const objectiveHeight = objectiveBlockHeight(objective, collapsedNodes);
        const objectiveY =
          objectiveCursor + (objectiveHeight - NODE_HEIGHT.objective) / 2;

        const objectiveKpiCount = objective.initiatives.reduce(
          (sum, initiative) => sum + initiative.kpis.length,
          0,
        );

        nodes.push({
          id: objective.id,
          position: {
            x: X_POSITION.objective,
            y: objectiveY,
          },
          style: NODE_WRAPPER_STYLE,
          draggable: true,
          selectable: false,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: asObjectiveNodeData(
            perspective.level,
            objective.label,
            objective.initiatives.length,
            objectiveKpiCount,
            objectiveCollapsed,
          ),
        });

        edges.push({
          id: `edge:${perspective.id}->${objective.id}`,
          source: perspective.id,
          target: objective.id,
          type: "smoothstep",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: ACCENT_BY_LEVEL[perspective.level],
            width: 18,
            height: 18,
          },
          style: edgeStyle("perspective", perspective.level),
        });

        if (!objectiveCollapsed && objective.initiatives.length > 0) {
          let initiativeCursor = objectiveCursor;
          for (const initiative of objective.initiatives) {
            const initiativeCollapsed = collapsedNodes.has(initiative.id);
            const initiativeHeight = initiativeBlockHeight(
              initiative,
              collapsedNodes,
            );
            const initiativeY =
              initiativeCursor +
              (initiativeHeight - NODE_HEIGHT.initiative) / 2;

            nodes.push({
              id: initiative.id,
              position: {
                x: X_POSITION.initiative,
                y: initiativeY,
              },
              style: NODE_WRAPPER_STYLE,
              draggable: true,
              selectable: false,
              sourcePosition: Position.Right,
              targetPosition: Position.Left,
              data: asInitiativeNodeData(
                perspective.level,
                initiative.label,
                initiative.kpis.length,
                initiativeCollapsed,
              ),
            });

            edges.push({
              id: `edge:${objective.id}->${initiative.id}`,
              source: objective.id,
              target: initiative.id,
              type: "smoothstep",
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: HIERARCHY_ACCENT.objective,
                width: 18,
                height: 18,
              },
              style: edgeStyle("objective"),
            });

            if (!initiativeCollapsed && initiative.kpis.length > 0) {
              let kpiCursor = initiativeCursor;
              for (const kpi of initiative.kpis) {
                nodes.push({
                  id: kpi.id,
                  position: {
                    x: X_POSITION.kpi,
                    y: kpiCursor,
                  },
                  style: NODE_WRAPPER_STYLE,
                  draggable: true,
                  selectable: false,
                  targetPosition: Position.Left,
                  data: asKpiNodeData(perspective.level, kpi.row),
                });

                edges.push({
                  id: `edge:${initiative.id}->${kpi.id}`,
                  source: initiative.id,
                  target: kpi.id,
                  type: "smoothstep",
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: HIERARCHY_ACCENT.initiative,
                    width: 18,
                    height: 18,
                  },
                  style: edgeStyle("initiative"),
                });

                kpiCursor += NODE_HEIGHT.kpi + LAYOUT_GAP.kpi;
              }
            }

            initiativeCursor += initiativeHeight + LAYOUT_GAP.initiative;
          }
        }

        objectiveCursor += objectiveHeight + LAYOUT_GAP.objective;
      }

      yCursor += perspectiveHeight + LAYOUT_GAP.perspective;
    }

    return { nodes, edges };
  }, [collapsedNodes, rows, snapshot]);

  if (isLoading) {
    return (
      <div className="rounded-md border bg-white p-4 text-xs text-muted-foreground">
        Loading perspective hierarchy...
      </div>
    );
  }

  return (
    <section className="space-y-2 rounded-md border bg-background p-3 sm:p-4">
      <div>
        <h2 className="text-sm font-semibold">BSC Perspective Hierarchy</h2>
        <p className="text-[11px] text-muted-foreground">
          Full chain across perspectives, objectives, initiatives, and KPIs.
        </p>
      </div>

      <div
        className="w-full overflow-hidden rounded-lg border bg-slate-300"
        style={{ height: 760 }}
      >
        <ReactFlow
          nodes={model.nodes}
          edges={model.edges}
          onNodeClick={(_, node) => {
            if (!isCollapsibleNode(node.id)) {
              return;
            }

            setCollapsedNodes((prev) => {
              const next = new Set(prev);
              if (next.has(node.id)) {
                next.delete(node.id);
              } else {
                next.add(node.id);
              }
              return next;
            });
          }}
          fitView
          fitViewOptions={{
            minZoom: 0.7,
            maxZoom: 1.2,
            padding: 0.25,
          }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) =>
              (node.data as FlowNodeData | undefined)?.accent ?? "#64748b"
            }
            className="bg-white!"
          />
          <Background
            color="#94a3b8"
            gap={18}
            size={1}
          />
          <Controls position="top-right" />
        </ReactFlow>
      </div>
    </section>
  );
}
