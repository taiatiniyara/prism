import { z } from "zod";
import { tool } from "ai";
import type { CurrentUser } from "@/lib/user.service";
import { validateToolAccess } from "../guardrails";
import {
  getKpiStatus,
  getBenchmarkingData,
  getCompletenessBreakdown,
  getScorecardSummary,
  getTrendAnalysis,
  getAnomalyInsights,
  getGovernanceAudit,
  getConfigurationOptions,
  getPerformanceSnapshot,
  getKpiDiagnostics,
  type CompletenessDimension,
} from "../data-service";

export const createAiTools = (user: CurrentUser) => {
  return {
    get_kpi_status: tool({
      description:
        "Get current KPI status and submission progress for a utility or all utilities. Returns completion rates, status counts (pending, entered, reviewed, approved, endorsed), and aggregate metrics.",
      inputSchema: z.object({
        utility_id: z.number().optional().describe("Specific utility ID to query. Defaults to user's utility."),
        report_period_id: z.number().optional().describe("Specific report period ID. Defaults to most recent."),
        all_utilities: z.boolean().optional().describe("Set to true to query all utilities for benchmarking."),
      }),
      execute: async ({ utility_id, report_period_id, all_utilities }) => {
        return getKpiStatus(user, { utility_id, report_period_id, all_utilities });
      },
    }),

    get_benchmarking_data: tool({
      description:
        "Get benchmarking data comparing utilities by completion rates. Returns rankings, peer averages, top/bottom performers, and user's utility position relative to peers.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Specific report period ID for comparison."),
        limit: z.number().optional().describe("Maximum number of records to return. Defaults to 20."),
        all_utilities: z.boolean().optional().describe("Set to true to compare across all utilities (requires global access)."),
      }),
      execute: async ({ report_period_id, limit, all_utilities }) => {
        return getBenchmarkingData(user, { report_period_id, limit, all_utilities });
      },
    }),

    get_completeness_breakdown: tool({
      description:
        "Get completeness breakdown by a specific dimension (category, subcategory, service_area, energy_source, etc.). Returns items with counts and percentages.",
      inputSchema: z.object({
        dimension: z
          .enum([
            "category",
            "subcategory",
            "service_area",
            "energy_source",
            "energy_provider",
            "energy_type",
            "energy_resource",
            "aggregation_level",
            "customer_type",
            "payment_mode",
          ])
          .describe("The dimension to break down completeness by."),
        report_period_id: z.number().optional().describe("Specific report period ID."),
      }),
      execute: async ({ dimension, report_period_id }) => {
        return getCompletenessBreakdown(user, dimension as CompletenessDimension, { report_period_id });
      },
    }),

    get_scorecard_summary: tool({
      description:
        "Get balanced scorecard summary including overall score, perspective scores, weakest KPIs, and exclusion reasons.",
      inputSchema: z.object({
        report_period_id: z.number().describe("Report period ID for the scorecard."),
      }),
      execute: async ({ report_period_id }) => {
        return getScorecardSummary(user, { report_period_id });
      },
    }),

    get_trend_analysis: tool({
      description:
        "Get trend analysis showing completion rate changes over time. Returns trends per utility with direction (improved/declined/stable) and delta in percentage points.",
      inputSchema: z.object({
        all_utilities: z.boolean().optional().describe("Set to true to analyze trends across all utilities."),
      }),
      execute: async ({ all_utilities }) => {
        return getTrendAnalysis(user, { all_utilities });
      },
    }),

    get_anomaly_insights: tool({
      description:
        "Get anomaly detection insights including completion drops, pending increases, and not-available increases. Returns anomalies with severity levels and a watchlist of high-pending utilities.",
      inputSchema: z.object({
        all_utilities: z.boolean().optional().describe("Set to true to detect anomalies across all utilities."),
      }),
      execute: async ({ all_utilities }) => {
        return getAnomalyInsights(user, { all_utilities });
      },
    }),

    get_governance_audit: tool({
      description:
        "Get governance and audit information including pending ownership distribution and recent updates. Shows who is responsible for pending items.",
      inputSchema: z.object({
        all_utilities: z.boolean().optional().describe("Set to true to audit across all utilities."),
      }),
      execute: async ({ all_utilities }) => {
        const accessCheck = validateToolAccess("get_governance_audit", user);
        if (!accessCheck.passed) {
          return { error: accessCheck.reason };
        }
        return getGovernanceAudit(user, { all_utilities });
      },
    }),

    get_configuration_options: tool({
      description:
        "Get available configuration options including report types, report periods, KPI categories, subcategories, and service areas.",
      inputSchema: z.object({}),
      execute: async () => {
        const accessCheck = validateToolAccess("get_configuration_options", user);
        if (!accessCheck.passed) {
          return { error: accessCheck.reason };
        }
        return getConfigurationOptions(user);
      },
    }),

    get_performance_snapshot: tool({
      description:
        "Get performance snapshot including review status counts, weakest KPIs, scorecard scores, and weakest perspectives.",
      inputSchema: z.object({
        report_period_id: z.number().describe("Report period ID for the performance snapshot."),
      }),
      execute: async ({ report_period_id }) => {
        return getPerformanceSnapshot(user, { report_period_id });
      },
    }),

    get_kpi_diagnostics: tool({
      description:
        "Get KPI diagnostics including missing input KPIs, error KPIs, stale KPIs, and unresolved comments. Useful for root cause analysis.",
      inputSchema: z.object({
        report_period_id: z.number().describe("Report period ID for diagnostics."),
      }),
      execute: async ({ report_period_id }) => {
        return getKpiDiagnostics(user, { report_period_id });
      },
    }),

    render_visualization: tool({
      description:
        "Render a visualization in the chat. Use this when the user's question would benefit from a visual representation (charts, tables, leaderboards, etc.).",
      inputSchema: z.object({
        visualization: z
          .object({
            type: z.enum(["table", "bar-chart", "line-chart", "leaderboard", "sankey", "heatmap", "radar", "scatter"]),
            title: z.string(),
          })
          .passthrough()
          .describe("The visualization configuration."),
      }),
      execute: async ({ visualization }) => {
        return { rendered: true, visualization };
      },
    }),

    suggest_follow_ups: tool({
      description:
        "Suggest 2-3 follow-up questions the user might want to ask based on the current conversation context.",
      inputSchema: z.object({
        questions: z.array(z.string()).min(2).max(3).describe("Array of follow-up question suggestions."),
      }),
      execute: async ({ questions }) => {
        return { suggestions: questions };
      },
    }),

    dashboard_link: tool({
      description: "Generate a deep link to a relevant dashboard page with pre-applied filters.",
      inputSchema: z.object({
        route: z
          .string()
          .describe("The dashboard route (e.g., '/data-entry', '/data-entry/review-kpi', '/data-entry/balanced-scorecard')."),
        filters: z.record(z.string()).optional().describe("Optional query parameters to pre-apply filters."),
        label: z.string().optional().describe("Optional label for the link."),
      }),
      execute: async ({ route, filters, label }) => {
        const queryString = filters
          ? "?" + Object.entries(filters).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")
          : "";
        return { url: `${route}${queryString}`, label: label ?? `Go to ${route}` };
      },
    }),
  };
};

export type AiTools = ReturnType<typeof createAiTools>;
