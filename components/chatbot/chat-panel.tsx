"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";
import type {
  ChatbotRecommendedView,
  ChatbotStreamEvent,
} from "@/lib/chatbot/types";

type ChatRole = "user" | "assistant";

interface UiMessage {
  id: string;
  role: ChatRole;
  content: string;
}

const SYSTEM_WELCOME =
  "Hi, I am PRISM AI. Ask me anything and I will help you work through it step by step.";

const MESSAGE_STAGGER_MS = 24;
const INITIAL_ASSISTANT_MESSAGE_ID = "assistant-welcome";

const ReactECharts = dynamic(() => import("echarts-for-react"), {
  ssr: false,
});

type VisualizationType =
  | "table"
  | "bar-chart"
  | "line-chart"
  | "leaderboard"
  | "sankey"
  | "heatmap"
  | "radar"
  | "scatter";

interface VisualizationPoint {
  label: string;
  value: number;
}

interface VisualizationLeaderboardItem {
  label: string;
  value: number;
  unit?: string;
}

interface SankeyNode {
  name: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface HeatmapValue {
  xIndex: number;
  yIndex: number;
  value: number;
}

interface RadarIndicator {
  name: string;
  max: number;
}

interface RadarSeries {
  name?: string;
  values: number[];
}

interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
}

type ChatVisualization =
  | {
      type: "table";
      title?: string;
      columns: string[];
      rows: Array<Array<string | number | null>>;
    }
  | {
      type: "bar-chart" | "line-chart";
      title?: string;
      series: VisualizationPoint[];
    }
  | {
      type: "leaderboard";
      title?: string;
      items: VisualizationLeaderboardItem[];
    }
  | {
      type: "sankey";
      title?: string;
      nodes: SankeyNode[];
      links: SankeyLink[];
    }
  | {
      type: "heatmap";
      title?: string;
      xAxis: string[];
      yAxis: string[];
      values: HeatmapValue[];
    }
  | {
      type: "radar";
      title?: string;
      indicators: RadarIndicator[];
      series: RadarSeries[];
    }
  | {
      type: "scatter";
      title?: string;
      points: ScatterPoint[];
    };

interface VisualizationExportData {
  fileBaseName: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
}

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const isVisualizationType = (value: unknown): value is VisualizationType => {
  return (
    value === "table" ||
    value === "bar-chart" ||
    value === "line-chart" ||
    value === "leaderboard" ||
    value === "sankey" ||
    value === "heatmap" ||
    value === "radar" ||
    value === "scatter"
  );
};

const toVisualizationPoint = (value: unknown): VisualizationPoint | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as { label?: unknown; value?: unknown };
  if (typeof raw.label !== "string" || !raw.label.trim()) {
    return null;
  }

  if (!isFiniteNumber(raw.value)) {
    return null;
  }

  return { label: raw.label.trim(), value: raw.value };
};

const toVisualization = (value: unknown): ChatVisualization | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as {
    type?: unknown;
    title?: unknown;
    columns?: unknown;
    rows?: unknown;
    series?: unknown;
    items?: unknown;
    nodes?: unknown;
    links?: unknown;
    xAxis?: unknown;
    yAxis?: unknown;
    values?: unknown;
    indicators?: unknown;
    points?: unknown;
  };

  if (!isVisualizationType(raw.type)) {
    return null;
  }

  const title = typeof raw.title === "string" ? raw.title.trim() : undefined;

  if (raw.type === "table") {
    if (!Array.isArray(raw.columns) || !Array.isArray(raw.rows)) {
      return null;
    }

    const columns = raw.columns
      .filter((column): column is string => typeof column === "string")
      .map((column) => column.trim())
      .filter((column) => column.length > 0);

    if (!columns.length) {
      return null;
    }

    const rows = raw.rows.filter(Array.isArray).map((row) =>
      row.map((cell) => {
        if (cell == null) {
          return null;
        }

        if (typeof cell === "string" || typeof cell === "number") {
          return cell;
        }

        return String(cell);
      }),
    );

    return {
      type: "table",
      title,
      columns,
      rows,
    };
  }

  if (raw.type === "bar-chart" || raw.type === "line-chart") {
    if (!Array.isArray(raw.series)) {
      return null;
    }

    const series = raw.series
      .map(toVisualizationPoint)
      .filter((point): point is VisualizationPoint => point !== null);

    if (!series.length) {
      return null;
    }

    return {
      type: raw.type,
      title,
      series,
    };
  }

  if (raw.type === "sankey") {
    if (!Array.isArray(raw.nodes) || !Array.isArray(raw.links)) {
      return null;
    }

    const nodes = raw.nodes.flatMap((node): SankeyNode[] => {
      if (!node || typeof node !== "object") {
        return [];
      }

      const parsed = node as { name?: unknown };
      if (typeof parsed.name !== "string" || !parsed.name.trim()) {
        return [];
      }

      return [{ name: parsed.name.trim() }];
    });

    const links = raw.links.flatMap((link): SankeyLink[] => {
      if (!link || typeof link !== "object") {
        return [];
      }

      const parsed = link as {
        source?: unknown;
        target?: unknown;
        value?: unknown;
      };

      if (typeof parsed.source !== "string" || !parsed.source.trim()) {
        return [];
      }

      if (typeof parsed.target !== "string" || !parsed.target.trim()) {
        return [];
      }

      if (!isFiniteNumber(parsed.value)) {
        return [];
      }

      return [
        {
          source: parsed.source.trim(),
          target: parsed.target.trim(),
          value: parsed.value,
        },
      ];
    });

    if (!nodes.length || !links.length) {
      return null;
    }

    return {
      type: "sankey",
      title,
      nodes,
      links,
    };
  }

  if (raw.type === "heatmap") {
    if (
      !Array.isArray(raw.xAxis) ||
      !Array.isArray(raw.yAxis) ||
      !Array.isArray(raw.values)
    ) {
      return null;
    }

    const xAxis = raw.xAxis
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const yAxis = raw.yAxis
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const values = raw.values.flatMap((entry): HeatmapValue[] => {
      if (!Array.isArray(entry) || entry.length < 3) {
        return [];
      }

      const xIndex = Number(entry[0]);
      const yIndex = Number(entry[1]);
      const value = Number(entry[2]);

      if (!Number.isInteger(xIndex) || !Number.isInteger(yIndex)) {
        return [];
      }

      if (xIndex < 0 || yIndex < 0) {
        return [];
      }

      if (!Number.isFinite(value)) {
        return [];
      }

      return [{ xIndex, yIndex, value }];
    });

    if (!xAxis.length || !yAxis.length || !values.length) {
      return null;
    }

    return {
      type: "heatmap",
      title,
      xAxis,
      yAxis,
      values,
    };
  }

  if (raw.type === "radar") {
    if (!Array.isArray(raw.indicators) || !Array.isArray(raw.series)) {
      return null;
    }

    const indicators = raw.indicators.flatMap((indicator): RadarIndicator[] => {
      if (!indicator || typeof indicator !== "object") {
        return [];
      }

      const parsed = indicator as { name?: unknown; max?: unknown };
      if (typeof parsed.name !== "string" || !parsed.name.trim()) {
        return [];
      }

      const max = Number(parsed.max);
      return [
        {
          name: parsed.name.trim(),
          max: Number.isFinite(max) && max > 0 ? max : 100,
        },
      ];
    });

    const series = raw.series.flatMap((seriesItem): RadarSeries[] => {
      if (!seriesItem || typeof seriesItem !== "object") {
        return [];
      }

      const parsed = seriesItem as { name?: unknown; values?: unknown };
      if (!Array.isArray(parsed.values)) {
        return [];
      }

      const values = parsed.values
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));

      if (!values.length) {
        return [];
      }

      return [
        {
          ...(typeof parsed.name === "string" && parsed.name.trim()
            ? { name: parsed.name.trim() }
            : {}),
          values,
        },
      ];
    });

    if (!indicators.length || !series.length) {
      return null;
    }

    const alignedSeries = series.filter(
      (item) => item.values.length === indicators.length,
    );

    if (!alignedSeries.length) {
      return null;
    }

    return {
      type: "radar",
      title,
      indicators,
      series: alignedSeries,
    };
  }

  if (raw.type === "scatter") {
    if (!Array.isArray(raw.points)) {
      return null;
    }

    const points = raw.points.flatMap((point): ScatterPoint[] => {
      if (!point || typeof point !== "object") {
        return [];
      }

      const parsed = point as { x?: unknown; y?: unknown; label?: unknown };

      if (!isFiniteNumber(parsed.x) || !isFiniteNumber(parsed.y)) {
        return [];
      }

      const label =
        typeof parsed.label === "string" && parsed.label.trim().length > 0
          ? parsed.label.trim()
          : undefined;

      return [
        {
          x: parsed.x,
          y: parsed.y,
          ...(label ? { label } : {}),
        },
      ];
    });

    if (!points.length) {
      return null;
    }

    return {
      type: "scatter",
      title,
      points,
    };
  }

  if (!Array.isArray(raw.items)) {
    return null;
  }

  const items = raw.items.flatMap((item): VisualizationLeaderboardItem[] => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const parsed = item as {
      label?: unknown;
      value?: unknown;
      unit?: unknown;
    };

    if (typeof parsed.label !== "string" || !parsed.label.trim()) {
      return [];
    }

    if (!isFiniteNumber(parsed.value)) {
      return [];
    }

    const normalizedUnit =
      typeof parsed.unit === "string" ? parsed.unit.trim() : "";

    return [
      {
        label: parsed.label.trim(),
        value: parsed.value,
        ...(normalizedUnit ? { unit: normalizedUnit } : {}),
      },
    ];
  });

  if (!items.length) {
    return null;
  }

  return {
    type: "leaderboard",
    title,
    items,
  };
};

const resolveVisualizationCandidate = (
  value: unknown,
): ChatVisualization | null => {
  if (value && typeof value === "object" && "visualization" in value) {
    return toVisualization(
      (value as { visualization?: unknown }).visualization,
    );
  }

  return toVisualization(value);
};

const extractVisualizationFromPlainJson = (
  content: string,
): {
  visualization: ChatVisualization;
  matchedBlock: string;
} | null => {
  let depth = 0;
  let start = -1;
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      if (depth === 0) {
        continue;
      }

      depth -= 1;
      if (depth !== 0 || start < 0) {
        continue;
      }

      const block = content.slice(start, i + 1);

      try {
        const parsed = JSON.parse(block) as unknown;
        const visualization = resolveVisualizationCandidate(parsed);

        if (visualization) {
          return {
            visualization,
            matchedBlock: block,
          };
        }
      } catch {
        // Ignore invalid JSON segments and continue scanning.
      }

      start = -1;
    }
  }

  return null;
};

const extractVisualizationFromMessage = (
  content: string,
): {
  text: string;
  visualization: ChatVisualization | null;
} => {
  const codeBlockPattern = /```(?:json)?\s*([\s\S]*?)```/g;
  let visualization: ChatVisualization | null = null;
  let matchedBlock = "";

  for (const match of content.matchAll(codeBlockPattern)) {
    const rawJson = match[1]?.trim();
    if (!rawJson) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawJson) as unknown;
      const candidate = resolveVisualizationCandidate(parsed);

      if (candidate) {
        visualization = candidate;
        matchedBlock = match[0];
        break;
      }
    } catch {
      continue;
    }
  }

  if (!visualization) {
    const plainJsonMatch = extractVisualizationFromPlainJson(content);
    if (plainJsonMatch) {
      visualization = plainJsonMatch.visualization;
      matchedBlock = plainJsonMatch.matchedBlock;
    }
  }

  if (!visualization) {
    return { text: content, visualization: null };
  }

  const text = content
    .replace(matchedBlock, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text,
    visualization,
  };
};

const toFileSafeBaseName = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const compact = normalized.replace(/(^-+|-+$)/g, "");
  return compact || "prism-chat-visualization";
};

const getVisualizationExportData = (
  visualization: ChatVisualization,
): VisualizationExportData => {
  const fileBaseName = toFileSafeBaseName(
    visualization.title ?? `prism-${visualization.type}`,
  );

  if (visualization.type === "table") {
    return {
      fileBaseName,
      headers: visualization.columns,
      rows: visualization.rows,
    };
  }

  if (
    visualization.type === "bar-chart" ||
    visualization.type === "line-chart"
  ) {
    return {
      fileBaseName,
      headers: ["Label", "Value"],
      rows: visualization.series.map((item) => [item.label, item.value]),
    };
  }

  if (visualization.type === "sankey") {
    return {
      fileBaseName,
      headers: ["Source", "Target", "Value"],
      rows: visualization.links.map((link) => [
        link.source,
        link.target,
        link.value,
      ]),
    };
  }

  if (visualization.type === "heatmap") {
    return {
      fileBaseName,
      headers: ["X", "Y", "Value"],
      rows: visualization.values.map((cell) => [
        visualization.xAxis[cell.xIndex] ?? String(cell.xIndex),
        visualization.yAxis[cell.yIndex] ?? String(cell.yIndex),
        cell.value,
      ]),
    };
  }

  if (visualization.type === "radar") {
    return {
      fileBaseName,
      headers: ["Series", ...visualization.indicators.map((item) => item.name)],
      rows: visualization.series.map((item) => [
        item.name ?? "Series",
        ...item.values,
      ]),
    };
  }

  if (visualization.type === "scatter") {
    return {
      fileBaseName,
      headers: ["Label", "X", "Y"],
      rows: visualization.points.map((point, index) => [
        point.label ?? `Point ${index + 1}`,
        point.x,
        point.y,
      ]),
    };
  }

  const leaderboard = visualization as Extract<
    ChatVisualization,
    { type: "leaderboard" }
  >;

  return {
    fileBaseName,
    headers: ["Rank", "Label", "Value", "Unit"],
    rows: leaderboard.items.map((item, index) => [
      index + 1,
      item.label,
      item.value,
      item.unit ?? "",
    ]),
  };
};

const csvEscape = (value: string | number | null): string => {
  if (value == null) {
    return "";
  }

  const asText = String(value);
  if (/[",\n]/.test(asText)) {
    return `"${asText.replace(/"/g, '""')}"`;
  }

  return asText;
};

const downloadCsv = (data: VisualizationExportData) => {
  const lines = [
    data.headers.map(csvEscape).join(","),
    ...data.rows.map((row) => row.map(csvEscape).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${data.fileBaseName}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const downloadExcel = (data: VisualizationExportData) => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(workbook, `${data.fileBaseName}.xlsx`);
};

const VisualizationRenderer = ({
  visualization,
  onExpand,
  onDownloadCsv,
  onDownloadExcel,
  hideActions = false,
}: {
  visualization: ChatVisualization;
  onExpand?: () => void;
  onDownloadCsv?: () => void;
  onDownloadExcel?: () => void;
  hideActions?: boolean;
}) => {
  const showActions =
    !hideActions && (onExpand || onDownloadCsv || onDownloadExcel);

  if (visualization.type === "table") {
    return (
      <section className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {visualization.title ? (
            <h4 className="text-xs font-semibold text-slate-800">
              {visualization.title}
            </h4>
          ) : (
            <span />
          )}
          {showActions ? (
            <div className="flex items-center gap-1">
              {onExpand ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onExpand}
                >
                  Expand
                </button>
              ) : null}
              {onDownloadCsv ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadCsv}
                >
                  CSV
                </button>
              ) : null}
              {onDownloadExcel ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadExcel}
                >
                  Excel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs text-slate-700">
            <thead>
              <tr className="border-b border-slate-200">
                {visualization.columns.map((column) => (
                  <th
                    key={column}
                    className="px-2 py-1.5 font-semibold text-slate-800"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visualization.rows.map((row, rowIndex) => (
                <tr
                  key={`${visualization.title ?? "table"}-${rowIndex}`}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  {visualization.columns.map((_, colIndex) => (
                    <td
                      key={`${rowIndex}-${colIndex}`}
                      className="px-2 py-1.5 align-top"
                    >
                      {row[colIndex] == null ? "-" : String(row[colIndex])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (visualization.type === "bar-chart") {
    const data = visualization.series.map((point) => ({
      name: point.label,
      value: point.value,
    }));

    return (
      <section className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {visualization.title ? (
            <h4 className="text-xs font-semibold text-slate-800">
              {visualization.title}
            </h4>
          ) : (
            <span />
          )}
          {showActions ? (
            <div className="flex items-center gap-1">
              {onExpand ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onExpand}
                >
                  Expand
                </button>
              ) : null}
              {onDownloadCsv ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadCsv}
                >
                  CSV
                </button>
              ) : null}
              {onDownloadExcel ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadExcel}
                >
                  Excel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="h-56 w-full rounded-md bg-slate-50 p-2">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart
              data={data}
              margin={{ top: 10, right: 8, left: 0, bottom: 24 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#cbd5e1"
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#475569" }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={48}
              />
              <YAxis tick={{ fontSize: 11, fill: "#475569" }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  borderColor: "#cbd5e1",
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="value"
                radius={[6, 6, 0, 0]}
                fill="#1e293b"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    );
  }

  if (visualization.type === "line-chart") {
    const data = visualization.series.map((point) => ({
      name: point.label,
      value: point.value,
    }));

    return (
      <section className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {visualization.title ? (
            <h4 className="text-xs font-semibold text-slate-800">
              {visualization.title}
            </h4>
          ) : (
            <span />
          )}
          {showActions ? (
            <div className="flex items-center gap-1">
              {onExpand ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onExpand}
                >
                  Expand
                </button>
              ) : null}
              {onDownloadCsv ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadCsv}
                >
                  CSV
                </button>
              ) : null}
              {onDownloadExcel ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadExcel}
                >
                  Excel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="h-56 w-full rounded-md bg-slate-50 p-2">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <LineChart
              data={data}
              margin={{ top: 10, right: 8, left: 0, bottom: 24 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#cbd5e1"
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#475569" }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={48}
              />
              <YAxis tick={{ fontSize: 11, fill: "#475569" }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  borderColor: "#cbd5e1",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#1e293b"
                strokeWidth={2}
                dot={{ r: 3, fill: "#0f172a" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-600 sm:grid-cols-3">
          {visualization.series.map((point) => (
            <div key={`${point.label}-${point.value}`}>
              {point.label}: {point.value}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (visualization.type === "sankey") {
    const option: EChartsOption = {
      tooltip: { trigger: "item" },
      series: [
        {
          type: "sankey",
          data: visualization.nodes,
          links: visualization.links,
          emphasis: { focus: "adjacency" },
          lineStyle: { curveness: 0.5 },
        },
      ],
    };

    return (
      <section className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {visualization.title ? (
            <h4 className="text-xs font-semibold text-slate-800">
              {visualization.title}
            </h4>
          ) : (
            <span />
          )}
          {showActions ? (
            <div className="flex items-center gap-1">
              {onExpand ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onExpand}
                >
                  Expand
                </button>
              ) : null}
              {onDownloadCsv ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadCsv}
                >
                  CSV
                </button>
              ) : null}
              {onDownloadExcel ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadExcel}
                >
                  Excel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="h-64 w-full rounded-md bg-slate-50 p-2">
          <ReactECharts
            option={option}
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      </section>
    );
  }

  if (visualization.type === "heatmap") {
    const heatmapData = visualization.values.map((cell) => [
      cell.xIndex,
      cell.yIndex,
      cell.value,
    ]);
    const maxValue = Math.max(
      ...visualization.values.map((item) => item.value),
      1,
    );

    const option: EChartsOption = {
      tooltip: {
        position: "top",
      },
      grid: { top: 20, left: 40, right: 12, bottom: 40 },
      xAxis: {
        type: "category",
        data: visualization.xAxis,
      },
      yAxis: {
        type: "category",
        data: visualization.yAxis,
      },
      visualMap: {
        min: 0,
        max: maxValue,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
      },
      series: [
        {
          type: "heatmap",
          data: heatmapData,
          label: { show: true, fontSize: 10 },
          emphasis: { itemStyle: { shadowBlur: 8 } },
        },
      ],
    };

    return (
      <section className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {visualization.title ? (
            <h4 className="text-xs font-semibold text-slate-800">
              {visualization.title}
            </h4>
          ) : (
            <span />
          )}
          {showActions ? (
            <div className="flex items-center gap-1">
              {onExpand ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onExpand}
                >
                  Expand
                </button>
              ) : null}
              {onDownloadCsv ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadCsv}
                >
                  CSV
                </button>
              ) : null}
              {onDownloadExcel ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadExcel}
                >
                  Excel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="h-72 w-full rounded-md bg-slate-50 p-2">
          <ReactECharts
            option={option}
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      </section>
    );
  }

  if (visualization.type === "radar") {
    const option: EChartsOption = {
      tooltip: {},
      legend: {
        top: 0,
      },
      radar: {
        indicator: visualization.indicators,
      },
      series: [
        {
          type: "radar",
          data: visualization.series.map((item) => ({
            value: item.values,
            name: item.name ?? "Series",
          })),
        },
      ],
    };

    return (
      <section className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {visualization.title ? (
            <h4 className="text-xs font-semibold text-slate-800">
              {visualization.title}
            </h4>
          ) : (
            <span />
          )}
          {showActions ? (
            <div className="flex items-center gap-1">
              {onExpand ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onExpand}
                >
                  Expand
                </button>
              ) : null}
              {onDownloadCsv ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadCsv}
                >
                  CSV
                </button>
              ) : null}
              {onDownloadExcel ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadExcel}
                >
                  Excel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="h-72 w-full rounded-md bg-slate-50 p-2">
          <ReactECharts
            option={option}
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      </section>
    );
  }

  if (visualization.type === "scatter") {
    const option: EChartsOption = {
      tooltip: {
        trigger: "item",
      },
      xAxis: { type: "value" },
      yAxis: { type: "value" },
      series: [
        {
          type: "scatter",
          data: visualization.points.map((item) => [
            item.x,
            item.y,
            item.label ?? "",
          ]),
          symbolSize: 12,
        },
      ],
    };

    return (
      <section className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {visualization.title ? (
            <h4 className="text-xs font-semibold text-slate-800">
              {visualization.title}
            </h4>
          ) : (
            <span />
          )}
          {showActions ? (
            <div className="flex items-center gap-1">
              {onExpand ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onExpand}
                >
                  Expand
                </button>
              ) : null}
              {onDownloadCsv ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadCsv}
                >
                  CSV
                </button>
              ) : null}
              {onDownloadExcel ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadExcel}
                >
                  Excel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="h-64 w-full rounded-md bg-slate-50 p-2">
          <ReactECharts
            option={option}
            style={{ height: "100%", width: "100%" }}
          />
        </div>
      </section>
    );
  }

  if (visualization.type === "leaderboard") {
    return (
      <section className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {visualization.title ? (
            <h4 className="text-xs font-semibold text-slate-800">
              {visualization.title}
            </h4>
          ) : (
            <span />
          )}
          {showActions ? (
            <div className="flex items-center gap-1">
              {onExpand ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onExpand}
                >
                  Expand
                </button>
              ) : null}
              {onDownloadCsv ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadCsv}
                >
                  CSV
                </button>
              ) : null}
              {onDownloadExcel ? (
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onDownloadExcel}
                >
                  Excel
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <ol className="space-y-1 text-xs text-slate-700">
          {visualization.items.map((item, index) => (
            <li
              key={`${item.label}-${item.value}`}
              className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5"
            >
              <span>
                {index + 1}. {item.label}
              </span>
              <span className="font-semibold">
                {item.value}
                {item.unit ? ` ${item.unit}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return null;
};

const parseSseEvents = (
  chunk: string,
): { events: ChatbotStreamEvent[]; remainder: string } => {
  const blocks = chunk.split("\n\n");
  const remainder = blocks.pop() ?? "";
  const events: ChatbotStreamEvent[] = [];

  for (const block of blocks) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, ""));

    if (!dataLines.length) {
      continue;
    }

    const payload = dataLines.join("\n");

    try {
      events.push(JSON.parse(payload) as ChatbotStreamEvent);
    } catch {
      continue;
    }
  }

  return { events, remainder };
};

export function ChatPanel() {
  const messageCounterRef = useRef(0);
  const nextMessageId = () => {
    messageCounterRef.current += 1;
    return `msg-${messageCounterRef.current}`;
  };

  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: INITIAL_ASSISTANT_MESSAGE_ID,
      role: "assistant",
      content: SYSTEM_WELCOME,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const [lastCapabilities, setLastCapabilities] = useState<string[]>([]);
  const [lastRecommendedView, setLastRecommendedView] =
    useState<ChatbotRecommendedView | null>(null);
  const [expandedVisualization, setExpandedVisualization] =
    useState<ChatVisualization | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  const handleDownloadVisualizationCsv = (visualization: ChatVisualization) => {
    try {
      downloadCsv(getVisualizationExportData(visualization));
    } catch {
      setError("Unable to download CSV file.");
    }
  };

  const handleDownloadVisualizationExcel = (
    visualization: ChatVisualization,
  ) => {
    try {
      downloadExcel(getVisualizationExportData(visualization));
    } catch {
      setError("Unable to download Excel file.");
    }
  };

  const historyPayload = useMemo(() => {
    return messages
      .filter(
        (message) => message.role === "assistant" || message.role === "user",
      )
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }, [messages]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content) {
      return;
    }

    const userMessage: UiMessage = {
      id: nextMessageId(),
      role: "user",
      content,
    };

    setMessages((previous) => [...previous, userMessage]);
    setDraft("");
    setError(null);
    setIsLoading(true);

    const assistantMessageId = nextMessageId();
    setMessages((previous) => [
      ...previous,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      },
    ]);

    try {
      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...historyPayload, { role: "user", content }],
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        const message = body.message ?? "Unable to complete chatbot response.";
        setError(message);
        setMessages((previous) =>
          previous.filter((message) => message.id !== assistantMessageId),
        );
        return;
      }

      if (!response.body) {
        setError("Streaming response was not available.");
        setMessages((previous) =>
          previous.filter((message) => message.id !== assistantMessageId),
        );
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalReply: string | null = null;

      const processEvents = (events: ChatbotStreamEvent[]) => {
        for (const event of events) {
          if (event.type === "meta") {
            setLastModel(event.model);
            setLastCapabilities(event.capabilitiesUsed ?? []);
            setLastRecommendedView(event.recommendedView ?? null);
            continue;
          }

          if (event.type === "delta") {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: `${message.content}${event.delta}` }
                  : message,
              ),
            );
            continue;
          }

          if (event.type === "done") {
            finalReply = event.reply;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: event.reply }
                  : message,
              ),
            );
            continue;
          }

          if (event.type === "error") {
            setError(event.message);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseEvents(buffer);
        buffer = parsed.remainder;
        processEvents(parsed.events);
      }

      buffer += decoder.decode();
      if (buffer.trim().length > 0) {
        const parsed = parseSseEvents(`${buffer}\n\n`);
        processEvents(parsed.events);
      }

      if (finalReply === null) {
        setMessages((previous) => {
          const currentAssistant = previous.find(
            (message) => message.id === assistantMessageId,
          );

          if (!currentAssistant || !currentAssistant.content.trim()) {
            return previous.filter(
              (message) => message.id !== assistantMessageId,
            );
          }

          return previous;
        });
      }
    } catch {
      setError("Unable to complete chatbot response.");
      setMessages((previous) =>
        previous.filter((message) => message.id !== assistantMessageId),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage();
  };

  const clearConversation = () => {
    setMessages([
      {
        id: INITIAL_ASSISTANT_MESSAGE_ID,
        role: "assistant",
        content: SYSTEM_WELCOME,
      },
    ]);
    setDraft("");
    setError(null);
    setLastModel(null);
    setLastCapabilities([]);
    setLastRecommendedView(null);
  };

  const onComposerKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isLoading && draft.trim()) {
        void sendMessage();
      }
    }
  };

  return (
    <section className="animate-in fade-in duration-300 flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">PRISM AI</h2>
        <button
          type="button"
          onClick={clearConversation}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
        >
          New chat
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-6 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {messages.map((message, index) => {
            const isUser = message.role === "user";
            const parsedMessage = extractVisualizationFromMessage(
              message.content,
            );
            return (
              <div
                key={message.id}
                className={isUser ? "flex justify-end" : "flex justify-start"}
                style={{ animationDelay: `${index * MESSAGE_STAGGER_MS}ms` }}
              >
                <article
                  className={`animate-in fade-in duration-300 max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "slide-in-from-right-2 bg-slate-800 text-white"
                      : "slide-in-from-left-2 bg-slate-100 text-slate-900"
                  }`}
                >
                  {!isUser && isLoading && !message.content.trim() ? (
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="size-1.5 animate-pulse rounded-full bg-slate-500" />
                      <span className="size-1.5 animate-pulse rounded-full bg-slate-500 [animation-delay:100ms]" />
                      <span className="size-1.5 animate-pulse rounded-full bg-slate-500 [animation-delay:200ms]" />
                      <p className="ml-1">Thinking...</p>
                    </div>
                  ) : (
                    <>
                      {parsedMessage.text ? (
                        <p className="whitespace-pre-wrap">
                          {parsedMessage.text}
                        </p>
                      ) : null}
                      {!isUser && parsedMessage.visualization ? (
                        <VisualizationRenderer
                          visualization={parsedMessage.visualization}
                          onExpand={() =>
                            setExpandedVisualization(
                              parsedMessage.visualization,
                            )
                          }
                          onDownloadCsv={() =>
                            handleDownloadVisualizationCsv(
                              parsedMessage.visualization as ChatVisualization,
                            )
                          }
                          onDownloadExcel={() =>
                            handleDownloadVisualizationExcel(
                              parsedMessage.visualization as ChatVisualization,
                            )
                          }
                        />
                      ) : null}
                    </>
                  )}
                </article>
              </div>
            );
          })}

          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-3 sm:px-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto w-full max-w-3xl"
        >
          <div className="rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-slate-400 focus-within:shadow-md">
            <textarea
              id="chatbot-draft"
              className="max-h-48 min-h-20 w-full resize-y border-0 bg-transparent px-2 py-1 text-sm text-slate-900 outline-none"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Message PRISM AI"
              required
            />

            <div className="mt-1 flex items-center justify-between px-1">
              <p
                className="text-[11px] text-slate-500"
                aria-live="polite"
              >
                {isLoading
                  ? "Assistant is composing a reply..."
                  : lastModel
                    ? lastCapabilities.length > 0
                      ? `Model: ${lastModel} | ${lastCapabilities.join(", ")}${lastRecommendedView ? ` | ${lastRecommendedView}` : ""}`
                      : `Model: ${lastModel}`
                    : ""}
              </p>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
                disabled={isLoading}
              >
                {isLoading ? "Sending" : "Send"}
              </button>
            </div>
          </div>
        </form>

        {error ? (
          <section
            className="mx-auto mt-3 w-full max-w-3xl rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            aria-live="polite"
          >
            {error}
          </section>
        ) : null}
      </div>

      {expandedVisualization ? (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Expanded visualization
              </h3>
              <button
                type="button"
                onClick={() => setExpandedVisualization(null)}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <VisualizationRenderer
              visualization={expandedVisualization}
              hideActions={true}
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  handleDownloadVisualizationCsv(expandedVisualization)
                }
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  handleDownloadVisualizationExcel(expandedVisualization)
                }
                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                Download Excel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
