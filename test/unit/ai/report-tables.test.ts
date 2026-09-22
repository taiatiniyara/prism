import { describe, expect, it } from "vitest";

import {
  MAX_RESOLVED_TABLE_ROWS,
  ReportTableRegistry,
  extractTablesFromToolOutput,
  resolveReportTableRefs,
  resolveReportToJson,
} from "@/lib/ai/report-tables";
import { visualizationJsonFromToolInput } from "@/lib/ai/visualization";

const ranking = {
  columns: ["Utility", "SAIDI", "Rank"],
  rows: [
    { Utility: "TPL", SAIDI: 57.62, Rank: 1 },
    { Utility: "EFL", SAIDI: 310.4, Rank: 2 },
    { Utility: "SP", SAIDI: 482.1, Rank: 3 },
  ],
};

const registryWith = (tables: Record<string, unknown>, toolCallId = "call_1") => {
  const registry = new ReportTableRegistry();
  registry.addToolResult(toolCallId, { data: { tables }, metadata: {} });
  return registry;
};

const report = (dataTable: unknown) => ({
  type: "report",
  title: "FY2024",
  sections: [
    { heading: "Reliability", content: "TPL leads.", data_table: dataTable },
    { heading: "Outlook", content: "Steady." },
  ],
});

type Sections = Array<{ data_table?: { columns: string[]; rows: Record<string, unknown>[] } }>;
const sectionsOf = (viz: unknown) => (viz as { sections: Sections }).sections;

describe("extractTablesFromToolOutput", () => {
  it("reads tables from the AiToolResult wrapper and from a bare payload", () => {
    expect(Object.keys(extractTablesFromToolOutput({ data: { tables: { a: ranking } } }))).toEqual(["a"]);
    expect(Object.keys(extractTablesFromToolOutput({ tables: { b: ranking } }))).toEqual(["b"]);
  });

  it("ignores malformed tables and outputs without tables", () => {
    expect(extractTablesFromToolOutput({ data: { rows: [] } })).toEqual({});
    expect(extractTablesFromToolOutput("nope")).toEqual({});
    expect(
      extractTablesFromToolOutput({ tables: { bad: { columns: "x", rows: [] }, worse: { columns: ["a"], rows: [1] } } }),
    ).toEqual({});
  });
});

describe("resolveReportTableRefs", () => {
  it("fills a table_ref with today's inline { columns, rows } shape", () => {
    const out = resolveReportTableRefs(report({ table_ref: "kpi_ranking" }), registryWith({ kpi_ranking: ranking }));
    expect(out.resolved).toEqual(["kpi_ranking"]);
    expect(sectionsOf(out.visualization)[0].data_table).toEqual(ranking);
  });

  it("honours columns (subset + order) and limit", () => {
    const out = resolveReportTableRefs(
      report({ table_ref: "kpi_ranking", columns: ["Rank", "Utility", "Nope"], limit: 2 }),
      registryWith({ kpi_ranking: ranking }),
    );
    expect(sectionsOf(out.visualization)[0].data_table).toEqual({
      columns: ["Rank", "Utility"],
      rows: [
        { Rank: 1, Utility: "TPL" },
        { Rank: 2, Utility: "EFL" },
      ],
    });
  });

  it("drops the table — not the section, not the turn — when the ref is unknown", () => {
    const registry = registryWith({ kpi_ranking: ranking });
    const out = resolveReportTableRefs(report({ table_ref: "missing" }), registry);
    expect(out.unresolved).toEqual(["missing"]);
    expect(sectionsOf(out.visualization)[0]).toEqual({ heading: "Reliability", content: "TPL leads." });
    expect(registry.unresolvedRefs).toEqual(["missing"]);
  });

  it("leaves inline tables, non-report blocks and its input untouched", () => {
    const registry = registryWith({ kpi_ranking: ranking });
    const inline = report(ranking);
    expect(resolveReportTableRefs(inline, registry).visualization).toEqual(inline);

    const chart = { type: "bar-chart", data: [] };
    expect(resolveReportTableRefs(chart, registry).visualization).toBe(chart);

    const withRef = report({ table_ref: "kpi_ranking" });
    resolveReportTableRefs(withRef, registry);
    expect(withRef.sections[0].data_table).toEqual({ table_ref: "kpi_ranking" });
  });

  it("resolves a bare key to the most recent bundle, and toolCallId:key to a specific one", () => {
    const registry = new ReportTableRegistry();
    registry.addToolResult("call_1", { tables: { t: { columns: ["v"], rows: [{ v: "old" }] } } });
    registry.addToolResult("call_2", { tables: { t: { columns: ["v"], rows: [{ v: "new" }] } } });
    expect(registry.get("t")?.rows[0].v).toBe("new");
    expect(registry.get("call_1:t")?.rows[0].v).toBe("old");
  });

  it("caps resolved rows", () => {
    const big = { columns: ["n"], rows: Array.from({ length: 500 }, (_, n) => ({ n })) };
    const out = resolveReportTableRefs(report({ table_ref: "big", limit: 400 }), registryWith({ big }));
    expect(sectionsOf(out.visualization)[0].data_table?.rows).toHaveLength(MAX_RESOLVED_TABLE_ROWS);
  });
});

describe("resolveReportToJson", () => {
  it("shrinks the row cap until the block fits the size limit", () => {
    const wide = {
      columns: ["n", "note"],
      rows: Array.from({ length: 100 }, (_, n) => ({ n, note: "x".repeat(200) })),
    };
    const out = resolveReportToJson(report({ table_ref: "wide" }), registryWith({ wide }), 8000);
    expect(out).not.toBeNull();
    expect(out!.json.length).toBeLessThanOrEqual(8000);
    const rows = sectionsOf(JSON.parse(out!.json))[0].data_table!.rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
  });

  it("returns null when the block is oversize on its own", () => {
    const huge = { ...report(undefined), executive_summary: "x".repeat(9000) };
    expect(resolveReportToJson(huge, new ReportTableRegistry(), 8000)).toBeNull();
  });
});

describe("visualizationJsonFromToolInput with a table registry", () => {
  it("emits fully populated report JSON — what the client, PDF and Word export consume", () => {
    const raw = visualizationJsonFromToolInput(
      "render_visualization",
      { visualization: report({ table_ref: "kpi_ranking", limit: 1 }) },
      registryWith({ kpi_ranking: ranking }),
    );
    const parsed = JSON.parse(raw!);
    expect(sectionsOf(parsed)[0].data_table).toEqual({ columns: ranking.columns, rows: [ranking.rows[0]] });
    expect(raw).not.toContain("table_ref");
  });

  it("is unchanged for callers that pass no registry", () => {
    const viz = report(ranking);
    expect(visualizationJsonFromToolInput("render_visualization", { visualization: viz })).toBe(JSON.stringify(viz));
  });
});
