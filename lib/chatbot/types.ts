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
  | "category-completeness-snapshot"
  | "subcategory-completeness-snapshot"
  | "service-area-completeness-snapshot"
  | "energy-source-completeness-snapshot"
  | "energy-provider-completeness-snapshot"
  | "energy-type-completeness-snapshot"
  | "energy-resource-completeness-snapshot"
  | "aggregation-level-completeness-snapshot"
  | "customer-type-completeness-snapshot"
  | "payment-mode-completeness-snapshot"
  | "custom-kpi-pipeline-snapshot"
  | "input-value-lookup"
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
