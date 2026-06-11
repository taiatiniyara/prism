import { describe, expect, it } from "vitest";
import { recordToolFailure, resetToolCircuit } from "@/lib/ai/data-service/utils";
import { createAiTools } from "@/lib/ai/tools";

describe("tool circuit breaker", () => {
  it("records tool failures without cooldown below threshold", () => {
    resetToolCircuit("cb-test-1");
    expect(recordToolFailure("cb-test-1")).toBe(true);
    expect(recordToolFailure("cb-test-1")).toBe(true);
    expect(recordToolFailure("cb-test-1")).toBe(true);
    expect(recordToolFailure("cb-test-1")).toBe(true);
  });

  it("enters cooldown after max failures (5)", () => {
    resetToolCircuit("cb-test-2");
    recordToolFailure("cb-test-2"); // 1
    recordToolFailure("cb-test-2"); // 2
    recordToolFailure("cb-test-2"); // 3
    recordToolFailure("cb-test-2"); // 4
    expect(recordToolFailure("cb-test-2")).toBe(false); // 5th triggers cooldown
    expect(recordToolFailure("cb-test-2")).toBe(false); // still in cooldown
  });

  it("resets circuit breaker", () => {
    resetToolCircuit("cb-test-3");
    for (let i = 0; i < 5; i++) recordToolFailure("cb-test-3");
    // 5 failures trigger cooldown
    expect(recordToolFailure("cb-test-3")).toBe(false);
    resetToolCircuit("cb-test-3");
    expect(recordToolFailure("cb-test-3")).toBe(true);
  });
});

describe("createAiTools", () => {
  const mockUser = { id: "test-user", role: "BMO" as const, org_id: 1 };

  it("creates all 41 tools", () => {
    const tools = createAiTools(mockUser);
    expect(Object.keys(tools)).toHaveLength(41);
  });

  it("includes core KPI tools", () => {
    const tools = createAiTools(mockUser);
    expect(tools).toHaveProperty("get_kpi_status");
    expect(tools).toHaveProperty("get_scorecard_summary");
    expect(tools).toHaveProperty("get_benchmarking_data");
    expect(tools).toHaveProperty("get_trend_analysis");
    expect(tools).toHaveProperty("get_anomaly_insights");
  });

  it("includes diagnostic tools", () => {
    const tools = createAiTools(mockUser);
    expect(tools).toHaveProperty("get_kpi_diagnostics");
    expect(tools).toHaveProperty("get_review_queue");
    expect(tools).toHaveProperty("get_input_status");
    expect(tools).toHaveProperty("get_data_quality_report");
  });

  it("includes advanced analysis tools", () => {
    const tools = createAiTools(mockUser);
    expect(tools).toHaveProperty("calculate_kpi");
    expect(tools).toHaveProperty("compare_periods");
    expect(tools).toHaveProperty("get_what_changed");
    expect(tools).toHaveProperty("get_compliance_status");
    expect(tools).toHaveProperty("get_kpi_correlation");
    expect(tools).toHaveProperty("compare_kpis_across_utilities");
  });

  it("includes all 7 Power BI tools", () => {
    const tools = createAiTools(mockUser);
    expect(tools).toHaveProperty("query_power_bi");
    expect(tools).toHaveProperty("diagnose_power_bi");
    expect(tools).toHaveProperty("discover_datasets");
    expect(tools).toHaveProperty("discover_schema");
    expect(tools).toHaveProperty("discover_report");
    expect(tools).toHaveProperty("discover_visuals");
    expect(tools).toHaveProperty("query_visual");
  });

  it("includes utility tools", () => {
    const tools = createAiTools(mockUser);
    expect(tools).toHaveProperty("render_visualization");
    expect(tools).toHaveProperty("suggest_follow_ups");
    expect(tools).toHaveProperty("dashboard_link");
    expect(tools).toHaveProperty("generate_export");
  });

  it("each tool has a description", () => {
    const tools = createAiTools(mockUser);
    for (const [, tool] of Object.entries(tools)) {
      expect(tool.description).toBeTruthy();
    }
  });

  it("each tool has an inputSchema", () => {
    const tools = createAiTools(mockUser);
    for (const [, tool] of Object.entries(tools)) {
      expect(tool.inputSchema).toBeDefined();
    }
  });
});
