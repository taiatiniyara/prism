import { describe, expect, it } from "vitest";

import { AI_MODELS, AI_DEFAULTS, AI_PROMPT_VERSION } from "@/lib/ai/types";

describe("AI_MODELS", () => {
  it("has a primary model", () => {
    expect(AI_MODELS.primary).toBeTruthy();
    expect(AI_MODELS.primary).toContain("claude");
  });

  it("has a fallback model different from primary", () => {
    expect(AI_MODELS.fallback).toBeTruthy();
    expect(AI_MODELS.fallback).not.toBe(AI_MODELS.primary);
  });

  it("primary model is a Sonnet variant", () => {
    expect(AI_MODELS.primary).toContain("sonnet");
  });

  it("fallback is a Haiku variant", () => {
    expect(AI_MODELS.fallback).toContain("haiku");
  });
});

describe("AI_DEFAULTS", () => {
  it("defines max_message_length", () => {
    expect(AI_DEFAULTS.max_message_length).toBeGreaterThan(0);
  });

  it("defines max_history_turns", () => {
    expect(AI_DEFAULTS.max_history_turns).toBeGreaterThan(0);
  });
});

describe("AI_PROMPT_VERSION", () => {
  it("is a date string", () => {
    expect(AI_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}(-[a-z]+-v\d+)?$/);
  });
});

describe("AiChatMessage type", () => {
  it("accepts user messages", () => {
    const msg = { role: "user" as const, content: "Hello" };
    expect(msg.role).toBe("user");
  });

  it("accepts assistant messages", () => {
    const msg = { role: "assistant" as const, content: "Hi there" };
    expect(msg.role).toBe("assistant");
  });

  it("accepts messages with tool calls", () => {
    const msg = {
      role: "assistant" as const,
      content: "Let me check...",
      toolCalls: [{ toolCallId: "call_1", toolName: "get_kpi_status" as const, args: {} }],
    };
    expect(msg.toolCalls).toHaveLength(1);
  });
});

describe("AiToolName union type", () => {
  const allToolNames = [
    "get_kpi_status",
    "get_benchmarking_data",
    "get_completeness_breakdown",
    "get_trend_analysis",
    "get_anomaly_insights",
    "get_governance_audit",
    "get_configuration_options",
    "get_kpi_diagnostics",
    "render_visualization",
    "suggest_follow_ups",
    "calculate_kpi",
    "dashboard_link",
    "get_review_queue",
    "get_input_status",
    "explain_kpi",
    "get_custom_kpi_status",
    "get_service_area_breakdown",
    "get_peer_group_analysis",
    "get_risk_assessment",
    "get_data_quality_report",
    "compare_periods",
    "get_what_changed",
    "get_compliance_status",
    "get_kpi_targets",
    "get_kpi_correlation",
    "compare_kpis_across_utilities",
    "generate_export",
    "get_country_hierarchy",
    "get_industry_benchmarks",
    "get_executive_digest",
    "get_review_queue_entries",
    "get_guided_entry",
    "query_power_bi",
    "diagnose_power_bi",
    "discover_datasets",
    "discover_schema",
    "discover_report",
    "get_ai_usage",
    "pbi_schema",
    "pbi_query",
    "pbi_query_catalog",
    "pbi_match",
    "pbi_context",
    "pbi_freshness",
    "pbi_chart",
    "pbi_anomalies",
    "pbi_deeplink",
    "pbi_export",
    "pbi_trend",
    "pbi_risk_score",
    "pbi_report",
    "pbi_alerts",
    "pbi_peer_groups",
    "pbi_donor_reports",
    "pbi_renewable_scenario",
    "pbi_forecast",
    "pbi_best_worst",
    "pbi_similar_utilities",
    "pbi_correlations",
    "pbi_prioritize",
    "pbi_briefing",
    "pbi_completeness",
    "pbi_regulatory",
    "pbi_training",
    "pbi_tariff_sim",
    "pbi_donor_fill",
    "pbi_project_impact",
  ] as const;

  it("has the expected number of tools", () => {
    expect(allToolNames.length).toBeGreaterThan(60);
  });

  it("all tool names are unique", () => {
    const unique = new Set(allToolNames);
    expect(unique.size).toBe(allToolNames.length);
  });

  it("all tool names follow snake_case convention", () => {
    for (const name of allToolNames) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
