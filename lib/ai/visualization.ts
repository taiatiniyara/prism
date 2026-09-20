import type {
  AiBarChartVisualization,
  AiLineChartVisualization,
} from "./types";

export const MAX_VISUALIZATIONS_PER_TURN = 5;
export const MAX_VISUALIZATION_JSON_SIZE = 50_000;

export const VISUALIZATION_TYPES = new Set([
  "table",
  "bar-chart",
  "line-chart",
  "leaderboard",
  "sankey",
  "heatmap",
  "radar",
  "scatter",
]);

export const isVisualizationType = (v: unknown): boolean =>
  typeof v === "string" && VISUALIZATION_TYPES.has(v);

/**
 * Extracts the raw visualization JSON from a `render_visualization` tool input.
 * Returns null for any other tool or when the payload is absent/oversized (the
 * client caps each extracted block at 50KB and 5 charts per message).
 */
export function visualizationJsonFromToolInput(
  toolName: string,
  input: unknown,
): string | null {
  if (toolName !== "render_visualization") return null;
  const viz = (input as { visualization?: unknown } | null)?.visualization;
  if (!viz || typeof viz !== "object" || viz === null) return null;
  const raw = JSON.stringify(viz);
  if (!raw || raw.length > MAX_VISUALIZATION_JSON_SIZE) return null;
  return raw;
}

/** Wraps raw visualization JSON in a fenced ```json block for the assistant text. */
export function appendVisualizationFence(content: string, rawJson: string): string {
  const fence = `\`\`\`json\n${rawJson}\n\`\`\``;
  return content ? `${content}\n\n${fence}` : fence;
}

/**
 * True when a fenced code block's content parses to JSON describing a known
 * visualization type. Used to hide the raw block from markdown rendering once
 * the chart itself is rendered from the same JSON.
 */
export function isVisualizationFenceBlock(codeBlockContent: string): boolean {
  const trimmed = codeBlockContent.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") return false;
    const type = (parsed as { type?: unknown }).type;
    return isVisualizationType(type);
  } catch {
    return false;
  }
}

/** Recharts-friendly flat row: `label` (x axis) plus one key per series. */
export type VizRechartsRow = Record<string, string | number | null> & {
  label: string;
};

export interface NormalizedChartOptions {
  title: string;
  rows: VizRechartsRow[];
  seriesKeys: string[];
  unit?: string;
  colorKey?: string;
  colorPositive?: string;
  colorNegative?: string;
  referenceLine?: { label: string; value: number } | null;
  referenceArea?: { label: string; lower: number; upper: number } | null;
}

const toNumOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function normalizeLineChart(
  d: AiLineChartVisualization,
): NormalizedChartOptions {
  const referenceLine =
    d.reference_line && typeof d.reference_line.value === "number"
      ? {
          label: String(d.reference_line.label ?? ""),
          value: d.reference_line.value,
        }
      : null;

  const referenceArea =
    d.reference_area &&
    typeof d.reference_area.lower === "number" &&
    typeof d.reference_area.upper === "number"
      ? {
          label: String(d.reference_area.label ?? ""),
          lower: d.reference_area.lower,
          upper: d.reference_area.upper,
        }
      : null;

  // Canonical single-series shape: series = [{ label, value }]
  if (Array.isArray(d.series)) {
    const isCanonical =
      d.series.length > 0 &&
      d.series.every(
        (s) =>
          !!s &&
          typeof s === "object" &&
          "label" in s &&
          "value" in s &&
          !Array.isArray((s as { data?: unknown }).data),
      );
    if (isCanonical) {
      const rows = (d.series as Array<{ label: string; value: number }>).map(
        (s) => ({ label: String(s.label), value: toNumOrNull(s.value) }),
      );
      return { title: d.title, rows, seriesKeys: ["value"], referenceLine, referenceArea };
    }

    // Multi-series shape: series = [{ name, data: [{ ...row }] }]
    const xKey = typeof d.x_key === "string" ? d.x_key : undefined;
    const rows: VizRechartsRow[] = [];
    const seriesKeys: string[] = [];
    for (const s of d.series) {
      const multi = s as {
        name?: string;
        data?: Array<Record<string, unknown>>;
      };
      if (!multi || !Array.isArray(multi.data)) continue;
      const name = multi.name || `Series ${seriesKeys.length + 1}`;
      seriesKeys.push(name);
      for (const point of multi.data) {
        if (!point || typeof point !== "object") continue;
        const xVal =
          (xKey ? point[xKey] : undefined) ?? point.label ?? point.year ?? "";
        const yVal = point.value ?? point.y;
        const existing = rows.find((r) => r.label === String(xVal));
        if (existing) {
          existing[name] = toNumOrNull(yVal);
        } else {
          const row: VizRechartsRow = { label: String(xVal) };
          row[name] = toNumOrNull(yVal);
          rows.push(row);
        }
      }
    }
    return { title: d.title, rows, seriesKeys, referenceLine, referenceArea, unit: d.unit };
  }

  // Flexible shape: data = [{ x_key: ..., [yKey]: value }]
  if (Array.isArray(d.data)) {
    const xKey = d.x_key ?? "label";
    const yKeys =
      Array.isArray(d.y_keys) && d.y_keys.length > 0
        ? d.y_keys
        : typeof d.y_keys === "string"
          ? [d.y_keys]
          : d.data.length > 0 && typeof d.data[0] === "object"
            ? Object.keys(d.data[0] as Record<string, unknown>).filter(
                (k) => k !== xKey,
              )
            : [];
    const rows = d.data.map((raw) => {
      const rowObj = raw as Record<string, unknown>;
      const row: VizRechartsRow = { label: String(rowObj?.[xKey] ?? "") };
      for (const k of yKeys) row[k] = toNumOrNull(rowObj?.[k]);
      return row;
    });
    return {
      title: d.title,
      rows,
      seriesKeys: yKeys,
      referenceLine,
      referenceArea,
      unit: d.unit,
    };
  }

  return { title: d.title, rows: [], seriesKeys: [], referenceLine, referenceArea };
}

export function normalizeBarChart(
  d: AiBarChartVisualization,
): NormalizedChartOptions {
  const referenceLine =
    d.reference_line && typeof d.reference_line.value === "number"
      ? {
          label: String(d.reference_line.label ?? ""),
          value: d.reference_line.value,
        }
      : null;

  const referenceArea =
    d.reference_area &&
    typeof d.reference_area.lower === "number" &&
    typeof d.reference_area.upper === "number"
      ? {
          label: String(d.reference_area.label ?? ""),
          lower: d.reference_area.lower,
          upper: d.reference_area.upper,
        }
      : null;

  // Canonical shape: series = [{ label, value }]
  if (Array.isArray(d.series) && d.series.length > 0) {
    const rows = (d.series as Array<{ label: string; value: number }>).map(
      (s) => ({ label: String(s.label), value: toNumOrNull(s.value) }),
    );
    return {
      title: d.title,
      rows,
      seriesKeys: ["value"],
      unit: d.unit,
      colorKey: d.color_key,
      colorPositive: d.color_positive,
      colorNegative: d.color_negative,
      referenceLine,
      referenceArea,
    };
  }

  // Flexible shape: data rows keyed by x_key / y_keys, or plain [{ label, value }]
  if (Array.isArray(d.data)) {
    const first = d.data[0] as Record<string, unknown> | undefined;
    const isLabelValue =
      first &&
      typeof first === "object" &&
      "label" in first &&
      "value" in first &&
      (!d.x_key || typeof d.x_key !== "string");

    if (isLabelValue) {
      const rows = d.data.map((raw) => ({
        label: String((raw as Record<string, unknown>).label ?? ""),
        value: toNumOrNull((raw as Record<string, unknown>).value),
      }));
      return {
        title: d.title,
        rows,
        seriesKeys: ["value"],
        unit: d.unit,
        colorKey: d.color_key,
        colorPositive: d.color_positive,
        colorNegative: d.color_negative,
        referenceLine,
        referenceArea,
      };
    }

    const xKey = d.x_key ?? "label";
    const yKeys =
      Array.isArray(d.y_keys) && d.y_keys.length > 0
        ? d.y_keys
        : typeof d.y_keys === "string"
          ? [d.y_keys]
          : first && typeof first === "object"
            ? Object.keys(first).filter((k) => k !== xKey)
            : [];
    const rows = d.data.map((raw) => {
      const rowObj = raw as Record<string, unknown>;
      const row: VizRechartsRow = { label: String(rowObj?.[xKey] ?? "") };
      for (const k of yKeys) row[k] = toNumOrNull(rowObj?.[k]);
      return row;
    });
    return {
      title: d.title,
      rows,
      seriesKeys: yKeys,
      unit: d.unit,
      colorKey: d.color_key,
      colorPositive: d.color_positive,
      colorNegative: d.color_negative,
      referenceLine,
      referenceArea,
    };
  }

  return {
    title: d.title,
    rows: [],
    seriesKeys: [],
    unit: d.unit,
    colorKey: d.color_key,
    colorPositive: d.color_positive,
    colorNegative: d.color_negative,
    referenceLine,
    referenceArea,
  };
}