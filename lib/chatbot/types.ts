export type ChatRole = "user" | "assistant";

export type ChatbotCapabilityName =
  | "report-period-overview"
  | "anomaly-insights"
  | "performance-snapshot"
  | "scorecard-snapshot"
  | "review-kpi-diagnostics"
  | "benchmarking-snapshot"
  | "trend-snapshot"
  | "governance-audit-snapshot"
  | "configuration-setup-snapshot"
  | "visual-presentation-hints";

export type ChatbotRecommendedView =
  | "text"
  | "table"
  | "bar-chart"
  | "line-chart"
  | "leaderboard"
  | "sankey"
  | "heatmap"
  | "radar"
  | "scatter"
  | "dashboard";

export interface ChatMessageInput {
  role: ChatRole;
  content: string;
}

export interface ChatbotQueryInput {
  messages: ChatMessageInput[];
  sessionId?: number | null;
}

export interface ChatbotQueryResponse {
  reply: string;
  model: string;
  capabilitiesUsed?: ChatbotCapabilityName[];
  recommendedView?: ChatbotRecommendedView;
}

export type ChatbotStreamEvent =
  | {
      type: "meta";
      model: string;
      sessionId?: number;
      capabilitiesUsed?: ChatbotCapabilityName[];
      recommendedView?: ChatbotRecommendedView;
    }
  | {
      type: "delta";
      delta: string;
    }
  | {
      type: "done";
      reply: string;
    }
  | {
      type: "error";
      message: string;
    };
