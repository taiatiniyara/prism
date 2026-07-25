import { z } from "zod";
import { tool } from "ai";
import type { CurrentUser } from "@/lib/user.service";
import { isConfiguredForDax, isPbiHealthy } from "@/lib/powerbi";
import { getUsageStats } from "../rate-limit";
import {
  getPbiSchema, runPbiQuery, getQueryCatalogData,
  setPbiContext, clearPbiContext, getFreshnessStatus, resolveNlQuery,
  generateDeepLink, exportQueryResults, detectAnomalies, recommendChart,
  computeRiskScores, generatePerformanceReport, generateProactiveAlerts,
  generatePeerGroups, getDonorTemplates, generateRenewableScenario,
  forecastTrend, findHistoricalExtremes, findSimilarUtilities,
  computeKpiCorrelations, prioritizeInvestments, generateExecutiveBriefing,
  scoreDataCompleteness, trackRegulatoryThresholds, recommendCapacityBuilding,
  simulateTariffChange, autoFillDonorApplication, projectImpact,
} from "../data-service";

import { withSizeLimit } from "./utils";

function pbiUnavailableResponse() {
  return {
    error: "Power BI is currently unavailable (dataset requires user authentication not supported for service principals). Instead, use PRISM-native tools: get_kpi_status, get_benchmarking_data, get_trend_analysis, get_completeness_breakdown, get_peer_group_analysis, get_risk_assessment, get_executive_digest, get_anomaly_insights, get_compliance_status, get_data_quality_report, get_kpi_correlation, compare_kpis_across_utilities, compare_periods, get_industry_benchmarks, calculate_kpi, explain_kpi, get_kpi_targets, get_service_area_breakdown.",
  };
}

export function createPowerBiTools(user: CurrentUser, _abortSignal?: AbortSignal, sessionId?: number) {
  const pbiDown = !isPbiHealthy() || !isConfiguredForDax();
  return {
    pbi_schema: tool({
      description:
        "Get the full Power BI dataset schema instantly — no API discovery needed. Returns all table names, columns, and descriptions. Use this to understand what data is available before writing DAX. Pass table_name to get details for a specific table. Pass search to find tables/columns matching a keyword.",
      inputSchema: z.object({
        table_name: z.string().optional().describe("Specific table to get details for (e.g., 'Fact GeneratorsData'). Omit to see all."),
        search: z.string().optional().describe("Search keyword to find relevant tables and columns (e.g., 'capacity', 'SAIDI', 'revenue')."),
      }),
      execute: async ({ table_name, search }) => {
        return getPbiSchema({ table_name, search });
      },
    }),

    pbi_query_catalog: tool({
      description:
        "List all available pre-built Power BI query templates. Use this to see what questions can be answered with a single call instead of writing custom DAX.",
      inputSchema: z.object({}),
      execute: async () => {
        return getQueryCatalogData();
      },
    }),

    pbi_query: tool({
      description:
        "Run a pre-built, tested Power BI query. Much faster than writing custom DAX. Use pbi_query_catalog for full list. Use pbi_match to find the right query from natural language. Key queries: saidi_by_utility, saifi_by_utility, reliability_summary, rated_capacity, rated_capacity_by_utility, generation_output, generation_by_source, peak_demand, system_losses, distribution_overview, financial_summary, cost_recovery, customer_overview, metering_summary, workforce_summary, safety_summary, utility_profile, peer_comparison, composite_score, whatif_sensitivity, saidi_trend, generation_trend, losses_trend, recovery_trend, electrification_trend.",
      inputSchema: z.object({
        query: z.string().describe("Query template name. Use pbi_query_catalog for full list or pbi_match for NL matching."),
        params: z.record(z.string()).optional().describe("Query parameters. Context defaults (utility, fy) from pbi_context are auto-applied if set."),
      }),
      execute: async ({ query, params }) => {
        if (pbiDown) return pbiUnavailableResponse();
        return runPbiQuery({ query, params }, user);
      },
    }),

    pbi_match: tool({
      description: "Match a natural language question to the best Power BI query template. Use this when you're not sure which query to use.",
      inputSchema: z.object({
        question: z.string().describe("The user's question in their own words."),
      }),
      execute: async ({ question }) => {
        return resolveNlQuery(question, sessionId);
      },
    }),

    pbi_context: tool({
      description: "Set or view smart context defaults for Power BI queries. When utility and fy are set, pbi_query auto-fills those parameters so the user doesn't need to repeat them.",
      inputSchema: z.object({
        utility: z.string().optional().describe("Utility acronym (e.g., EPC, TPL)"),
        fy: z.string().optional().describe("Fiscal year (e.g., FY2023)"),
        clear: z.boolean().optional().describe("Set true to clear all context."),
      }),
      execute: async ({ utility, fy, clear }) => {
        if (!sessionId) {
          return { context: {}, message: "No active session. Please start a chat session first." };
        }
        if (clear) {
          clearPbiContext(sessionId);
          return { context: {}, message: "Context cleared." };
        }
        const ctx = setPbiContext(sessionId, { utility, fy });
        return { context: ctx, message: Object.keys(ctx).length > 1 ? "Context updated." : "No context set." };
      },
    }),

    pbi_freshness: tool({
      description: "Check when the Power BI dataset was last refreshed. Use this before reporting data so users know if they're looking at stale information.",
      inputSchema: z.object({}),
      execute: async () => {
        return getFreshnessStatus();
      },
    }),

    pbi_chart: tool({
      description: "Get a chart recommendation for Power BI query results. Returns the best chart type, title, and reasoning.",
      inputSchema: z.object({
        query_name: z.string().describe("The query template name that produced the results."),
        row_count: z.number().optional().describe("Number of rows returned (helps refine the chart choice)."),
      }),
      execute: async ({ query_name, row_count }) => {
        return recommendChart(query_name, row_count ?? 10);
      },
    }),

    pbi_anomalies: tool({
      description: "Detect statistical anomalies in Power BI query results. Identifies values that deviate significantly from the group average (z-score method). Use after running any utility-comparison query.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("The rows from a pbi_query result."),
        threshold: z.number().min(1).max(5).optional().describe("Z-score threshold for anomaly detection. Default 2.0. Lower = more sensitive."),
      }),
      execute: async ({ rows, threshold }) => {
        const anomalies = detectAnomalies(rows, { threshold });
        return { anomalies, total_checked: rows.length, threshold: threshold ?? 2.0 };
      },
    }),

    pbi_deeplink: tool({
      description: "Generate a direct link to open the Power BI dashboard to a specific page with filters pre-applied. Use when the user wants to see the data in the dashboard.",
      inputSchema: z.object({
        page_name: z.string().optional().describe("Dashboard page name to navigate to."),
        filter_utility: z.string().optional().describe("Pre-filter to this utility."),
        filter_fy: z.string().optional().describe("Pre-filter to this fiscal year."),
      }),
      execute: async ({ page_name, filter_utility, filter_fy }) => {
        return generateDeepLink({ page_name, filter_utility, filter_fy });
      },
    }),

    pbi_export: tool({
      description: "Export Power BI query results as CSV or JSON for download. Use when the user asks to save, download, or export data.",
      inputSchema: z.object({
        query_name: z.string().describe("Query template name (for the filename)."),
        rows: z.array(z.record(z.unknown())).describe("The rows from a pbi_query result."),
        format: z.enum(["csv", "json"]).optional().describe("Export format. Defaults to csv."),
      }),
      execute: async ({ query_name, rows, format }) => {
        return exportQueryResults(rows, query_name, format ?? "csv");
      },
    }),

    pbi_trend: tool({
      description: "Alias for running trend-focused queries. Returns multi-year data for charting. Available: saidi_trend, generation_trend, losses_trend, recovery_trend, electrification_trend.",
      inputSchema: z.object({
        query: z.enum(["saidi_trend", "generation_trend", "losses_trend", "recovery_trend", "electrification_trend"]),
        params: z.record(z.string()).optional().describe("Optional parameters like { utility: 'EPC' }."),
      }),
      execute: async ({ query, params }) => {
        if (pbiDown) return pbiUnavailableResponse();
        return runPbiQuery({ query, params }, user);
      },
    }),

    // ── Pacific Island Utility Domain Tools ──

    pbi_risk_score: tool({
      description: "Compute multi-dimensional risk scores for all utilities. Factors: diesel dependence, reliability (SAIDI), financial sustainability, electrification gap, and climate exposure (island geography). Returns risk levels (critical/high/moderate/low) and top concerns per utility. Use after running vulnerability_dashboard or climate_risk_profile.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Rows from vulnerability_dashboard or climate_risk_profile query."),
      }),
      execute: async ({ rows }) => {
        return computeRiskScores(rows);
      },
    }),

    pbi_report: tool({
      description: "Generate an automated performance report for a utility. Includes sections on reliability, losses, financials, customers, and recommendations. Use for donor reporting, board presentations, or quarterly reviews. Combine with pbi_query results.",
      inputSchema: z.object({
        utility: z.string().describe("Utility acronym (e.g., EPC)."),
        fy: z.string().describe("Fiscal year (e.g., FY2023)."),
        saidi_data: z.array(z.record(z.unknown())).optional().describe("SAIDI query results."),
        losses_data: z.array(z.record(z.unknown())).optional().describe("System losses query results."),
        financial_data: z.array(z.record(z.unknown())).optional().describe("Cost recovery query results."),
        customer_data: z.array(z.record(z.unknown())).optional().describe("Customer overview query results."),
        profile_data: z.array(z.record(z.unknown())).optional().describe("Utility profile query results."),
      }),
      execute: async ({ utility, fy, saidi_data, losses_data, financial_data, customer_data, profile_data }) => {
        const data: Record<string, Record<string, unknown>[]> = {};
        if (saidi_data) data.saidi_by_utility = saidi_data;
        if (losses_data) data.system_losses = losses_data;
        if (financial_data) data.cost_recovery = financial_data;
        if (customer_data) data.customer_overview = customer_data;
        if (profile_data) data.utility_profile = profile_data;
        return generatePerformanceReport(utility, fy, data);
      },
    }),

    pbi_alerts: tool({
      description: "Generate proactive alerts from query results. Checks against thresholds: SAIDI > 500, losses > 15%, recovery < 80%, diesel > 70%, electrification < 80%, LTIFR > 5. Use after running any comparison query.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Query result rows."),
        query_name: z.string().describe("Which query produced these rows (e.g., 'system_losses', 'saidi_by_utility')."),
      }),
      execute: async ({ rows, query_name }) => {
        return generateProactiveAlerts(rows, query_name);
      },
    }),

    pbi_peer_groups: tool({
      description: "Group utilities into fair peer groups by customer size (small/medium/large). Essential for meaningful benchmarking — a 5-island utility shouldn't be compared to a mainland utility with 500,000 customers.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Query result rows that include customer counts."),
        your_utility: z.string().optional().describe("Your utility acronym to identify which peer group you belong to."),
      }),
      execute: async ({ rows, your_utility }) => {
        return generatePeerGroups(rows, { your_utility });
      },
    }),

    pbi_donor_reports: tool({
      description: "Get donor-specific reporting templates and recommended KPIs. Includes PPA, ADB, World Bank, Green Climate Fund, and NZ MFAT. Shows what each donor requires and which Power BI query to run.",
      inputSchema: z.object({
        donor: z.string().optional().describe("Specific donor: ppa, adb, worldbank, gcf, nz_mfat. Omit to list all."),
      }),
      execute: async ({ donor }) => {
        return getDonorTemplates(donor);
      },
    }),

    pbi_renewable_scenario: tool({
      description: "Model the impact of adding solar + battery storage. Projects diesel displacement percentage and estimated savings for every utility. Use for renewable energy planning and grant applications.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Rows from diesel_dependence or renewable_penetration query."),
        additional_solar_mw: z.number().min(0.1).max(100).optional().describe("Additional solar PV capacity to model (MW). Default 5MW."),
        additional_battery_mwh: z.number().min(0).max(500).optional().describe("Battery storage to model (MWh). Default 10MWh."),
      }),
      execute: async ({ rows, additional_solar_mw, additional_battery_mwh }) => {
        return generateRenewableScenario(rows, { additional_solar_mw, additional_battery_mwh });
      },
    }),

    // ── Advanced Analytics Tools ──

    pbi_forecast: tool({
      description: "Project future performance using linear trend analysis. Takes historical data from trend queries and forecasts 2 periods ahead. Shows whether metrics are improving, deteriorating, or stable, with R-squared confidence.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Historical trend data (from saidi_trend, losses_trend, etc.)"),
        metric: z.string().describe("Which column to forecast (e.g., 'SAIDI', 'Losses %', 'Total MWh', 'Recovery %')."),
        periods_ahead: z.number().min(1).max(5).optional().describe("How many periods to forecast. Default 2."),
        utility: z.string().optional().describe("Specific utility. Omit for all."),
      }),
      execute: async ({ rows, metric, periods_ahead, utility }) => {
        return forecastTrend(rows, { metric, periods_ahead, utility });
      },
    }),

    pbi_best_worst: tool({
      description: "Find a utility's best and worst historical period for any metric. Answers: 'What was our best year for SAIDI?' or 'When were system losses worst?'",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Historical data rows that include period (FY) and the metric."),
        utility: z.string().describe("Utility acronym."),
        metric: z.string().describe("Metric to analyze (e.g., 'SAIDI', 'Losses %', 'Recovery %')."),
      }),
      execute: async ({ rows, utility, metric }) => {
        return findHistoricalExtremes(rows, { utility, metric });
      },
    }),

    pbi_similar_utilities: tool({
      description: "Find which utilities are most similar to yours using multi-dimensional cosine similarity across 9 features (capacity, SAIDI, losses, recovery, diesel dependence, customers, islands, electrification, renewable share).",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Rows from vulnerability_dashboard or climate_risk_profile query."),
        target_utility: z.string().describe("Your utility acronym to find peers for."),
      }),
      execute: async ({ rows, target_utility }) => {
        return findSimilarUtilities(rows, { target_utility });
      },
    }),

    pbi_correlations: tool({
      description: "Discover hidden relationships between KPIs using Pearson correlation. Surfaces insights like 'utilities with higher cost recovery tend to have lower SAIDI.' Finds the strongest positive and negative correlations across all numeric columns.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Rows from any multi-metric query (vulnerability_dashboard, composite_score, etc.)"),
      }),
      execute: async ({ rows }) => {
        return computeKpiCorrelations(rows);
      },
    }),

    pbi_prioritize: tool({
      description: "Rank utilities by where investment would have the biggest impact. Focus areas: reliability, renewable, electrification, financial, or all. Returns ranked list with recommended actions and estimated impact for each utility.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Rows from vulnerability_dashboard query."),
        budget_focus: z.enum(["reliability", "renewable", "electrification", "financial", "all"]).optional().describe("What type of investment to prioritize."),
      }),
      execute: async ({ rows, budget_focus }) => {
        return prioritizeInvestments(rows, { budget_focus });
      },
    }),

    pbi_briefing: tool({
      description: "Generate a 60-second executive briefing for board members, donors, or regulators. Includes 5 key numbers, top trends, red flags, recommendations, and a one-line summary. Audience options: board, donor, regulator.",
      inputSchema: z.object({
        utility: z.string().describe("Utility acronym."),
        fy: z.string().describe("Fiscal year."),
        saidi_data: z.array(z.record(z.unknown())).optional(),
        losses_data: z.array(z.record(z.unknown())).optional(),
        financial_data: z.array(z.record(z.unknown())).optional(),
        customer_data: z.array(z.record(z.unknown())).optional(),
        diesel_data: z.array(z.record(z.unknown())).optional(),
        audience: z.enum(["board", "donor", "regulator"]).optional().describe("Who is this briefing for?"),
      }),
      execute: async ({ utility, fy, saidi_data, losses_data, financial_data, customer_data, diesel_data, audience }) => {
        const data: Record<string, Record<string, unknown>[]> = {};
        if (saidi_data) data.saidi_by_utility = saidi_data;
        if (losses_data) data.system_losses = losses_data;
        if (financial_data) data.financial_summary = financial_data;
        if (customer_data) data.customer_overview = customer_data;
        if (diesel_data) data.diesel_dependence = diesel_data;
        return generateExecutiveBriefing(utility, fy, data, { audience });
      },
    }),

    pbi_completeness: tool({
      description: "Grade utilities A-F on how many KPIs they've submitted. Identifies which specific KPIs are missing per utility and recommends action. Critical for data quality assurance and donor reporting readiness.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Rows from any multi-metric query (vulnerability_dashboard or similar)."),
      }),
      execute: async ({ rows }) => {
        return scoreDataCompleteness(rows);
      },
    }),

    pbi_regulatory: tool({
      description: "Check utilities against regulatory benchmarks. Limits: SAIDI < 500, Losses < 15%, Recovery > 100%, LTIFR < 5, Electrification > 90%. Flags critical (>50% over limit) and warning-level violations.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Rows from any multi-metric query."),
      }),
      execute: async ({ rows }) => {
        return trackRegulatoryThresholds(rows);
      },
    }),

    pbi_training: tool({
      description: "Recommend training and capacity building programs based on workforce profile and performance gaps. Combines staff ratios, training rates, gender diversity, and KPI performance to identify urgent vs recommended training needs.",
      inputSchema: z.object({
        workforce_rows: z.array(z.record(z.unknown())).describe("Rows from workforce_summary query."),
        performance_rows: z.array(z.record(z.unknown())).describe("Rows from vulnerability_dashboard or utility_profile query."),
        utility: z.string().describe("Utility to assess."),
      }),
      execute: async ({ workforce_rows, performance_rows, utility }) => {
        return recommendCapacityBuilding(workforce_rows, performance_rows, { utility });
      },
    }),

    pbi_tariff_sim: tool({
      description: "Simulate the impact of changing tariff rates. Models revenue impact and affordability effects on customers. Use with tariff_affordability query results.",
      inputSchema: z.object({
        tariff_rows: z.array(z.record(z.unknown())).describe("Rows from tariff_affordability query."),
        customer_rows: z.array(z.record(z.unknown())).describe("Rows from customer_overview query."),
        change_pct: z.number().min(-50).max(100).describe("Percentage change (positive = increase, negative = decrease)."),
        utility: z.string().optional().describe("Specific utility. Omit for all."),
      }),
      execute: async ({ tariff_rows, customer_rows, change_pct, utility }) => {
        return simulateTariffChange(tariff_rows, customer_rows, { change_pct, utility });
      },
    }),

    pbi_donor_fill: tool({
      description: "Auto-fill a donor grant application using your utility's actual performance data. Replaces placeholders in donor templates with real KPI values. Supported donors: ppa, adb, worldbank, gcf, nz_mfat.",
      inputSchema: z.object({
        utility: z.string().describe("Your utility acronym."),
        fy: z.string().describe("Fiscal year."),
        donor: z.string().describe("Donor code: ppa, adb, worldbank, gcf, nz_mfat"),
        saidi_data: z.array(z.record(z.unknown())).optional(),
        losses_data: z.array(z.record(z.unknown())).optional(),
        financial_data: z.array(z.record(z.unknown())).optional(),
        customer_data: z.array(z.record(z.unknown())).optional(),
        diesel_data: z.array(z.record(z.unknown())).optional(),
        workforce_data: z.array(z.record(z.unknown())).optional(),
      }),
      execute: async ({ utility, fy, donor, saidi_data, losses_data, financial_data, customer_data, diesel_data, workforce_data }) => {
        const data: Record<string, Record<string, unknown>[]> = {};
        if (saidi_data) data.saidi_by_utility = saidi_data;
        if (losses_data) data.system_losses = losses_data;
        if (financial_data) data.cost_recovery = financial_data;
        if (customer_data) data.customer_overview = customer_data;
        if (diesel_data) data.diesel_dependence = diesel_data;
        if (workforce_data) data.workforce_summary = workforce_data;
        return autoFillDonorApplication(utility, fy, donor, data);
      },
    }),

    pbi_project_impact: tool({
      description: "Project the multi-year impact of an infrastructure investment. Models solar PV, battery storage, feeder upgrades, smart metering, and tariff reform. Shows year-by-year projections with cumulative impact.",
      inputSchema: z.object({
        rows: z.array(z.record(z.unknown())).describe("Baseline data rows from vulnerability_dashboard query."),
        utility: z.string().describe("Utility acronym."),
        project_type: z.enum(["solar", "battery", "feeder_upgrade", "metering", "tariff_reform"]),
        project_scale_mw: z.number().min(1).max(50).optional().describe("Project capacity in MW (for solar/battery)."),
        years: z.number().min(1).max(20).optional().describe("Projection horizon in years. Default 5."),
      }),
      execute: async ({ rows, utility, project_type, project_scale_mw, years }) => {
        return projectImpact(rows, { utility, project_type, project_scale_mw, years });
      },
    }),

    get_ai_usage: tool({
      description:
        "Get the current user's AI usage statistics including request counts, token consumption, estimated cost, tool calls, and error counts for recent days.",
      inputSchema: z.object({
        days: z.number().min(1).max(90).optional().describe("Number of days of history to return. Defaults to 7."),
      }),
      execute: async ({ days }) => {
        try {
          const stats = await getUsageStats(user.id, days ?? 7);
          return withSizeLimit(Promise.resolve({
            summary: {
              total_requests: stats.totalRequests,
              total_tokens: stats.totalTokens,
              estimated_cost_usd: (stats.totalCostCents / 100).toFixed(2),
              total_tool_calls: stats.totalToolCalls,
              total_errors: stats.totalErrors,
              period_days: days ?? 7,
            },
            daily: stats.daily,
          }));
        } catch {
          return { error: "Failed to retrieve usage statistics." };
        }
      },
    }),
  };
}
