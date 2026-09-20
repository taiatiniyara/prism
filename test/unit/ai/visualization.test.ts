import { describe, it, expect } from "vitest";
import {
  MAX_VISUALIZATIONS_PER_TURN,
  appendVisualizationFence,
  isVisualizationFenceBlock,
  isVisualizationType,
  normalizeBarChart,
  normalizeLineChart,
  visualizationJsonFromToolInput,
} from "@/lib/ai/visualization";

describe("visualizationJsonFromToolInput", () => {
  it("returns raw JSON for render_visualization tool input", () => {
    const payload = {
      type: "line-chart",
      title: "Trend",
      data: [{ label: "x", value: 1 }],
    };
    const raw = visualizationJsonFromToolInput("render_visualization", { visualization: payload });
    expect(raw).toBe(JSON.stringify(payload));
  });

  it("returns null for non-visualization tools", () => {
    const raw = visualizationJsonFromToolInput("run_analysis", { query: "SAIDI" });
    expect(raw).toBeNull();
  });

  it("returns null when visualization payload is missing", () => {
    const raw = visualizationJsonFromToolInput("render_visualization", { type: "line-chart" });
    expect(raw).toBeNull();
  });

  it("returns null when payload exceeds the client JSON cap", () => {
    const payload = { type: "bar-chart", data: "x".repeat(50_000) };
    const raw = visualizationJsonFromToolInput("render_visualization", { visualization: payload });
    expect(raw).toBeNull();
  });
});

describe("appendVisualizationFence", () => {
  it("wraps a fence around raw JSON", () => {
    expect(appendVisualizationFence("", '{"type":"bar-chart"}')).toBe(
      '```json\n{"type":"bar-chart"}\n```',
    );
  });

  it("appends after existing content with a blank line", () => {
    expect(appendVisualizationFence("Here it is", '{"type":"bar-chart"}')).toBe(
      "Here it is\n\n```json\n{\"type\":\"bar-chart\"}\n```",
    );
  });
});

describe("isVisualizationType", () => {
  it("recognizes all supported types", () => {
    for (const t of [
      "table",
      "bar-chart",
      "line-chart",
      "leaderboard",
      "sankey",
      "heatmap",
      "radar",
      "scatter",
    ]) {
      expect(isVisualizationType(t)).toBe(true);
    }
  });

  it("rejects unknown types and non-strings", () => {
    expect(isVisualizationType("chart")).toBe(false);
    expect(isVisualizationType(42)).toBe(false);
    expect(isVisualizationType(undefined)).toBe(false);
  });
});

describe("isVisualizationFenceBlock", () => {
  it("recognizes a fenced block containing a known visualization", () => {
    const block = '{"type": "bar-chart", "title": "SAIDI by Utility"}';
    expect(isVisualizationFenceBlock(block)).toBe(true);
  });

  it("recognizes the model's flexible line-chart shape", () => {
    const block =
      '{"type":"line-chart","title":"Renewable Penetration Trend","data":[{"year":"FY2022","PNG Power Limited":45}],"x_key":"year","y_keys":["PNG Power Limited"],"reference_line":{"label":"PPA Target (50%)","value":50}}';
    expect(isVisualizationFenceBlock(block)).toBe(true);
  });

  it("recognizes a table visualization", () => {
    const block = '{"type":"table","title":"Summary","columns":[{"key":"a","label":"A"}],"rows":[{"a":1}]}';
    expect(isVisualizationFenceBlock(block)).toBe(true);
  });

  it("rejects JSON without a known type field", () => {
    expect(isVisualizationFenceBlock('{"foo":"bar"}')).toBe(false);
    expect(isVisualizationFenceBlock("[1,2,3]")).toBe(false);
  });

  it("rejects malformed JSON and non-JSON text", () => {
    expect(isVisualizationFenceBlock("{oops}")).toBe(false);
    expect(isVisualizationFenceBlock("constant PI = 3.14")).toBe(false);
    expect(isVisualizationFenceBlock("")).toBe(false);
  });
});

describe("normalizeLineChart", () => {
  it("passes through canonical series shape", () => {
    const result = normalizeLineChart({
      type: "line-chart",
      title: "SAIDI",
      series: [
        { label: "FY2020", value: 12 },
        { label: "FY2021", value: 9 },
      ],
    });
    expect(result.title).toBe("SAIDI");
    expect(result.seriesKeys).toEqual(["value"]);
    expect(result.rows).toEqual([
      { label: "FY2020", value: 12 },
      { label: "FY2021", value: 9 },
    ]);
    expect(result.referenceLine).toBeNull();
  });

  it("builds multi-series rows from flexible data + x_key + y_keys", () => {
    const result = normalizeLineChart({
      type: "line-chart",
      title: "Renewable Penetration",
      data: [
        { year: "FY2022", "PNG Power Limited": 45, "Energy Fiji Limited": 20 },
        { year: "FY2023", "PNG Power Limited": 55, "Energy Fiji Limited": 24 },
      ],
      x_key: "year",
      y_keys: ["PNG Power Limited", "Energy Fiji Limited"],
      reference_line: { label: "Target (50%)", value: 50 },
    });
    expect(result.seriesKeys).toEqual(["PNG Power Limited", "Energy Fiji Limited"]);
    expect(result.rows).toEqual([
      { label: "FY2022", "PNG Power Limited": 45, "Energy Fiji Limited": 20 },
      { label: "FY2023", "PNG Power Limited": 55, "Energy Fiji Limited": 24 },
    ]);
    expect(result.referenceLine).toEqual({ label: "Target (50%)", value: 50 });
  });

  it("builds multi-series rows from {name, data} series", () => {
    const result = normalizeLineChart({
      type: "line-chart",
      title: "Losses",
      series: [
        { name: "Utility A", data: [{ year: "FY2022", value: 10 }, { year: "FY2023", value: 8 }] },
        { name: "Utility B", data: [{ year: "FY2022", value: 14 }, { year: "FY2023", value: 12 }] },
      ],
      x_key: "year",
    });
    expect(result.seriesKeys).toEqual(["Utility A", "Utility B"]);
    expect(result.rows).toEqual([
      { label: "FY2022", "Utility A": 10, "Utility B": 14 },
      { label: "FY2023", "Utility A": 8, "Utility B": 12 },
    ]);
  });

  it("returns empty rows when no data shape matches", () => {
    const result = normalizeLineChart({ type: "line-chart", title: "Empty" });
    expect(result.rows).toEqual([]);
    expect(result.seriesKeys).toEqual([]);
  });
});

describe("normalizeBarChart", () => {
  it("passes through canonical series shape", () => {
    const result = normalizeBarChart({
      type: "bar-chart",
      title: "SAIDI by Utility",
      series: [
        { label: "EFL", value: 24 },
        { label: "PNG", value: 45 },
      ],
    });
    expect(result.seriesKeys).toEqual(["value"]);
    expect(result.rows).toEqual([
      { label: "EFL", value: 24 },
      { label: "PNG", value: 45 },
    ]);
  });

  it("normalizes plain data rows with label/value", () => {
    const result = normalizeBarChart({
      type: "bar-chart",
      title: "Customers",
      data: [
        { label: "Residential", value: 480_000 },
        { label: "Commercial", value: 120_000 },
      ],
    });
    expect(result.seriesKeys).toEqual(["value"]);
    expect(result.rows[0]).toEqual({ label: "Residential", value: 480_000 });
  });

  it("normalizes data rows keyed by x_key/y_keys with color config", () => {
    const result = normalizeBarChart({
      type: "bar-chart",
      title: "Capex vs Opex",
      data: [
        { utility: "EFL", capex: 200, opex: 150 },
        { utility: "PNG", capex: 320, opex: 210 },
      ],
      x_key: "utility",
      y_keys: ["capex", "opex"],
      reference_line: { label: "Budget", value: 250 },
      color_key: "capex",
      color_positive: "#22c55e",
      color_negative: "#ef4444",
    });
    expect(result.seriesKeys).toEqual(["capex", "opex"]);
    expect(result.rows[1]).toEqual({ label: "PNG", capex: 320, opex: 210 });
    expect(result.referenceLine).toEqual({ label: "Budget", value: 250 });
    expect(result.colorPositive).toBe("#22c55e");
    expect(result.colorNegative).toBe("#ef4444");
  });

  it("returns empty rows when no data shape matches", () => {
    const result = normalizeBarChart({ type: "bar-chart", title: "Empty" });
    expect(result.rows).toEqual([]);
  });
});

describe("shared constants", () => {
  it("caps visualizations per turn to match the client", () => {
    expect(MAX_VISUALIZATIONS_PER_TURN).toBe(5);
  });
});