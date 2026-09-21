export type AiVisualizationType =
  | "table"
  | "bar-chart"
  | "line-chart"
  | "area-chart"
  | "leaderboard"
  | "sankey"
  | "heatmap"
  | "radar"
  | "scatter"
  | "report";

/** One section of a performance report (mirrors AutomatedReport / pbi_report). */
export interface AiReportSection {
  heading: string;
  content?: string;
  insight?: string;
  /**
   * INTENTIONAL divergence from AiTableVisualization (agreed #3↔#4): a report's
   * table uses **keyed rows** (`{ Column: value }`) — the model can't misalign a
   * value to the wrong column, and it matches the /api/ai/report-pdf input
   * verbatim. AiTableVisualization uses compact **positional** rows because it's
   * Zod-validated via render_visualization. If ever unified, we go keyed-rows
   * everywhere — a separate deliberate change, not a bug to reconcile.
   */
  data_table?: { columns: string[]; rows: Record<string, unknown>[] };
}

/** A multi-section performance report — renders inline with a Download PDF
 *  button (POSTs to /api/ai/report-pdf). Its shape matches the report-pdf
 *  route's input so the button can post it verbatim. */
export interface AiReportVisualization {
  type: "report";
  title: string;
  generated_at?: string;
  executive_summary?: string;
  sections: AiReportSection[];
}

export interface AiTableVisualization {
  type: "table";
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
}

export interface AiBarChartVisualization {
  type: "bar-chart";
  title: string;
  series?: Array<{ label: string; value: number }>;
  data?: Array<Record<string, string | number | null>>;
  x_key?: string;
  y_keys?: string[];
  x_label?: string;
  y_label?: string;
  unit?: string;
  description?: string;
  reference_line?: { label?: string; value: number };
  reference_area?: { label?: string; lower: number; upper: number };
  color_key?: string;
  color_positive?: string;
  color_negative?: string;
}

export interface AiLineChartVisualization {
  type: "line-chart";
  title: string;
  series?:
    | Array<{ label: string; value: number }>
    | Array<{ name: string; data: Array<Record<string, string | number | null>> }>;
  data?: Array<Record<string, string | number | null>>;
  x_key?: string;
  y_keys?: string[];
  x_label?: string;
  y_label?: string;
  unit?: string;
  description?: string;
  reference_line?: { label?: string; value: number };
  reference_area?: { label?: string; lower: number; upper: number };
}

export interface AiAreaChartVisualization {
  type: "area-chart";
  title: string;
  series?:
    | Array<{ label: string; value: number }>
    | Array<{ name: string; data: Array<Record<string, string | number | null>> }>;
  data?: Array<Record<string, string | number | null>>;
  x_key?: string;
  y_keys?: string[];
  x_label?: string;
  y_label?: string;
  unit?: string;
  description?: string;
  /** Stack multiple series into a cumulative area (e.g. energy mix over time). */
  stacked?: boolean;
  reference_line?: { label?: string; value: number };
  reference_area?: { label?: string; lower: number; upper: number };
}

export interface AiLeaderboardVisualization {
  type: "leaderboard";
  title: string;
  items: Array<{ label: string; value: number; unit?: string }>;
}

export interface AiSankeyVisualization {
  type: "sankey";
  title: string;
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number }>;
}

export interface AiHeatmapVisualization {
  type: "heatmap";
  title: string;
  xAxis: string[];
  yAxis: string[];
  values: number[][];
}

export interface AiRadarVisualization {
  type: "radar";
  title: string;
  indicators: Array<{ name: string; max: number }>;
  series: Array<{ name: string; values: number[] }>;
}

export interface AiScatterVisualization {
  type: "scatter";
  title: string;
  points: Array<{ x: number; y: number; label?: string }>;
  x_label?: string;
  y_label?: string;
}

export type AiVisualization =
  | AiTableVisualization
  | AiBarChartVisualization
  | AiLineChartVisualization
  | AiAreaChartVisualization
  | AiLeaderboardVisualization
  | AiSankeyVisualization
  | AiHeatmapVisualization
  | AiRadarVisualization
  | AiScatterVisualization
  | AiReportVisualization;

export type AiToolName =
  | "get_kpi_status"
  | "get_benchmarking_data"
  | "get_completeness_breakdown"
  | "get_trend_analysis"
  | "get_anomaly_insights"
  | "get_governance_audit"
  | "get_configuration_options"
  | "get_kpi_diagnostics"
  | "render_visualization"
  | "suggest_follow_ups"
  | "calculate_kpi"
  | "dashboard_link"
  | "get_review_queue"
  | "get_input_status"
  | "explain_kpi"
  | "get_custom_kpi_status"
  | "get_service_area_breakdown"
  | "get_peer_group_analysis"
  | "get_risk_assessment"
  | "get_data_quality_report"
  | "compare_periods"
  | "get_what_changed"
  | "get_compliance_status"
  | "get_kpi_targets"
  | "get_kpi_correlation"
  | "compare_kpis_across_utilities"
  | "drill_measure"
  | "generate_export"
  | "get_country_hierarchy"
  | "get_industry_benchmarks"
  | "get_executive_digest"
  | "get_review_queue_entries"
  | "get_guided_entry"
  | "query_power_bi"
  | "diagnose_power_bi"
  | "discover_datasets"
  | "discover_schema"
  | "discover_report"
  | "get_ai_usage"
  | "pbi_schema"
  | "pbi_query"
  | "pbi_query_catalog"
  | "pbi_match"
  | "pbi_context"
  | "pbi_freshness"
  | "pbi_chart"
  | "pbi_anomalies"
  | "pbi_deeplink"
  | "pbi_export"
  | "pbi_trend"
  | "pbi_risk_score"
  | "pbi_report"
  | "pbi_alerts"
  | "pbi_peer_groups"
  | "pbi_donor_reports"
  | "pbi_renewable_scenario"
  | "pbi_forecast"
  | "pbi_best_worst"
  | "pbi_similar_utilities"
  | "pbi_correlations"
  | "pbi_prioritize"
  | "pbi_briefing"
  | "pbi_completeness"
  | "pbi_regulatory"
  | "pbi_training"
  | "pbi_tariff_sim"
  | "pbi_donor_fill"
  | "pbi_project_impact";

export interface AiToolMetadata {
  // ISO string, not Date — this object is serialized straight into the tool-result
  // JSON sent back to the model; a raw Date fails the AI SDK's ModelMessage[] schema
  // (jsonValueSchema only allows null/string/number/boolean/plain-object/array) on the
  // next multi-step turn, once the tool result re-enters standardizePrompt.
  data_freshness?: string | null;
  data_completeness_pct?: number | null;
  source?: string;
}

export interface AiToolResult<T = unknown> {
  data: T;
  metadata?: AiToolMetadata;
  error?: string;
}

export type AiChatContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string; mimeType?: string };

export interface AiChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string | AiChatContentPart[];
  toolCalls?: AiToolCallInfo[];
  toolResults?: AiToolResultInfo[];
}

export interface AiToolCallInfo {
  toolCallId: string;
  toolName: AiToolName;
  args: Record<string, unknown>;
}

export interface AiToolResultInfo {
  toolCallId: string;
  toolName: AiToolName;
  result: AiToolResult;
}

export interface AiStreamMetadata {
  sessionId: number;
  turnId: number;
  model: string;
  promptVersion: string;
}

export interface AiUserContext {
  user_id: string;
  user_name: string;
  user_role: string | null;
  organisation_id: number | null;
  organisation_name: string | null;
  default_utility_id: string | null;
  default_utility_name: string | null;
}

export interface AiGuardrailResult {
  passed: boolean;
  rule?: string;
  reason?: string;
}

export const AI_PROMPT_VERSION = "2026-09-21-lean-reports";

export const AI_MODELS = {
  primary: "claude-sonnet-4-6",
  fallback: "claude-haiku-4-5-20251001",
  mini: "claude-haiku-4-5-20251001",
} as const;

export const AI_DEFAULTS = {
  max_message_length: 4000,
  max_history_turns: 4,
} as const;
