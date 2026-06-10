export type AiVisualizationType =
  | "table"
  | "bar-chart"
  | "line-chart"
  | "leaderboard"
  | "sankey"
  | "heatmap"
  | "radar"
  | "scatter";

export interface AiTableVisualization {
  type: "table";
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
}

export interface AiBarChartVisualization {
  type: "bar-chart";
  title: string;
  series: Array<{ label: string; value: number }>;
}

export interface AiLineChartVisualization {
  type: "line-chart";
  title: string;
  series: Array<{ label: string; value: number }>;
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
}

export type AiVisualization =
  | AiTableVisualization
  | AiBarChartVisualization
  | AiLineChartVisualization
  | AiLeaderboardVisualization
  | AiSankeyVisualization
  | AiHeatmapVisualization
  | AiRadarVisualization
  | AiScatterVisualization;

export type AiToolName =
  | "get_kpi_status"
  | "get_benchmarking_data"
  | "get_completeness_breakdown"
  | "get_scorecard_summary"
  | "get_trend_analysis"
  | "get_anomaly_insights"
  | "get_governance_audit"
  | "get_configuration_options"
  | "get_kpi_diagnostics"
  | "get_performance_snapshot"
  | "get_value_lookup"
  | "render_visualization"
  | "suggest_follow_ups"
  | "dashboard_link";

export interface AiToolMetadata {
  data_freshness?: Date | null;
  data_completeness_pct?: number | null;
  source?: string;
}

export interface AiToolResult<T = unknown> {
  data: T;
  metadata?: AiToolMetadata;
  error?: string;
}

export interface AiChatMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
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

export interface AiRateLimitInfo {
  allowed: boolean;
  remaining_requests: number;
  remaining_tokens: number;
  reset_at: Date;
  degraded_mode: boolean;
  concurrent_count?: number;
}

export interface AiGuardrailResult {
  passed: boolean;
  rule?: string;
  reason?: string;
}

export const AI_PROMPT_VERSION = "2026-06-10";

export const AI_MODELS = {
  primary: "claude-sonnet-4-6",
  fallback: "claude-haiku-4-5-20251001",
  mini: "claude-haiku-4-5-20251001",
} as const;

export const AI_RATE_LIMITS = {
  requests_per_minute: 30,
  tokens_per_day: 100_000,
  max_message_length: 4000,
  max_history_turns: 6,
} as const;
