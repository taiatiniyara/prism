import { z } from "zod";
import { tool } from "ai";
import type { CurrentUser } from "@/lib/user.service";
import { isConfiguredForDax, isConfigured } from "@/lib/powerbi.service";
import { validateToolAccess } from "../guardrails";
import type { AiToolResult } from "../types";
import { recordToolFailure } from "../data-service/utils";
import { getUsageStats } from "../rate-limit";
import { logger } from "@/lib/logger";
import {
  getKpiStatus,
  getBenchmarkingData,
  getCompletenessBreakdown,
  getTrendAnalysis,
  getAnomalyInsights,
  getGovernanceAudit,
  getConfigurationOptions,
  getKpiDiagnostics,
  calculateKpis,
  getReviewQueue,
  getInputStatus,
  explainKpi,
  getCustomKpiStatus,
  getServiceAreaBreakdown,
  getPeerGroupAnalysis,
  getRiskAssessment,
  getDataQualityReport,
  getWhatChanged,
  comparePeriods,
  type CompletenessDimension,
  getComplianceStatus,
  getKpiTargets,
  getKpiCorrelation,
  compareKpisAcrossUtilities,
  generateExport,
  getCountryHierarchy,
  getIndustryBenchmarks,
  getExecutiveDigest,
  getReviewQueueEntries,
  getGuidedEntry,
  queryPowerBi,
  diagnosePowerBi,
  discoverDatasets,
  discoverSchema,
  discoverReport,
  getPbiSchema,
  runPbiQuery,
  getQueryCatalogData,
  setPbiContext,
  getFreshnessStatus,
  resolveNlQuery,
  generateDeepLink,
  exportQueryResults,
  detectAnomalies,
  recommendChart,
  computeRiskScores,
  generatePerformanceReport,
  generateProactiveAlerts,
  generatePeerGroups,
  getDonorTemplates,
  generateRenewableScenario,
  forecastTrend,
  findHistoricalExtremes,
  findSimilarUtilities,
  computeKpiCorrelations,
  prioritizeInvestments,
  generateExecutiveBriefing,
  scoreDataCompleteness,
  trackRegulatoryThresholds,
  recommendCapacityBuilding,
  simulateTariffChange,
  autoFillDonorApplication,
  projectImpact,
  type PowerBiData,
  type DiagnosticData,
  type DiscoveryData,
  type SchemaData,
  type ReportData,
} from "../data-service";

const TOOL_TIMEOUT_MS = 15000;
const PBI_TOOL_TIMEOUT_MS = 30000;
const MAX_TOOL_RESULT_CHARS = 8000;

const truncateResult = (result: unknown): unknown => {
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str.length <= MAX_TOOL_RESULT_CHARS) return result;
  const truncated = str.slice(0, MAX_TOOL_RESULT_CHARS) + `\n\n[Truncated at ${MAX_TOOL_RESULT_CHARS} chars. Original length: ${str.length}]`;
  if (typeof result === "string") return truncated;
  return { _truncated: true, preview: str.slice(0, MAX_TOOL_RESULT_CHARS), original_length: str.length };
};

const withTimeout = <T>(promise: Promise<T>, toolName: string, timeoutMs = TOOL_TIMEOUT_MS): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => {
      const msg = `TOOL_TIMEOUT:${toolName} exceeded ${timeoutMs}ms`;
      logger.warn("[ai-tools] Tool timeout", { toolName, timeoutMs });
      reject(new Error(msg));
    }, timeoutMs),
  );
  return Promise.race([promise, timeout]).catch((err: unknown) => {
    recordToolFailure(toolName);
    throw err;
  });
};

const withSizeLimit = <T>(promise: Promise<T>): Promise<T> =>
  promise.then((result) => truncateResult(result) as T);

export const createAiTools = (user: CurrentUser, _abortSignal?: AbortSignal) => {
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
        return withTimeout(getKpiStatus(user, { utility_id, report_period_id, all_utilities }), "get_kpi_status");
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
        return withTimeout(getBenchmarkingData(user, { report_period_id, limit, all_utilities }), "get_benchmarking_data");
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
        return withTimeout(getCompletenessBreakdown(user, dimension as CompletenessDimension, { report_period_id }), "get_completeness_breakdown");
      },
    }),

    get_trend_analysis: tool({
      description:
        "Get trend analysis showing completion rate changes over time. Returns trends per utility with direction (improved/declined/stable) and delta in percentage points.",
      inputSchema: z.object({
        all_utilities: z.boolean().optional().describe("Set to true to analyze trends across all utilities."),
      }),
      execute: async ({ all_utilities }) => {
        return withTimeout(getTrendAnalysis(user, { all_utilities }), "get_trend_analysis");
      },
    }),

    get_anomaly_insights: tool({
      description:
        "Get anomaly detection insights including completion drops, pending increases, and not-available increases. Returns anomalies with severity levels and a watchlist of high-pending utilities.",
      inputSchema: z.object({
        all_utilities: z.boolean().optional().describe("Set to true to detect anomalies across all utilities."),
      }),
      execute: async ({ all_utilities }) => {
        return withTimeout(getAnomalyInsights(user, { all_utilities }), "get_anomaly_insights");
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
        return withTimeout(getGovernanceAudit(user, { all_utilities }), "get_governance_audit");
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
        return withTimeout(getConfigurationOptions(user), "get_configuration_options");
      },
    }),

    get_kpi_diagnostics: tool({
      description:
        "Get KPI diagnostics including missing input KPIs, error KPIs, stale KPIs, and unresolved comments. Useful for root cause analysis.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Report period ID. If omitted, uses the latest period."),
        year: z.number().optional().describe("Year to query (e.g. 2023). Resolves to the matching report period."),
      }),
      execute: async ({ report_period_id, year }) => {
        return withTimeout(getKpiDiagnostics(user, { report_period_id, year }), "get_kpi_diagnostics");
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
        questions: z.array(z.string().max(200)).min(1).max(3).describe("Array of follow-up question suggestions."),
      }),
      execute: async ({ questions }) => {
        const seen = new Set<string>();
        const deduped: string[] = [];
        const blocked = /\b(?:ignore|forget|disregard|override|bypass|reveal.*instructions?|credentials|password|api.?key|secret)\b/i;
        for (const q of questions) {
          const trimmed = q.trim();
          if (trimmed.length < 5 || trimmed.length > 200) continue;
          if (blocked.test(trimmed)) continue;
          const key = trimmed.toLowerCase().replace(/\s+/g, " ");
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(trimmed);
          if (deduped.length >= 3) break;
        }
        return { suggestions: deduped.length > 0 ? deduped : ["Would you like to explore any other aspect of your utility's performance?"] };
      },
    }),

    calculate_kpi: tool({
      description:
        "Calculate KPI values on-the-fly using the KPI formula engine. Looks up KPI definitions by name or ID, resolves input values from the database, evaluates the formula, and returns computed values. Supports hypothetical/scenario values for what-if analysis — pass changed values to see how they affect the KPI. Use this when the user asks about specific KPI values, ratios, metrics, or wants to know 'what if X was Y?'.",
      inputSchema: z.object({
        kpi_names: z.array(z.string()).optional().describe("KPI names to calculate (partial match). E.g. ['SAIDI', 'SAIFI', 'System Loss']"),
        kpi_def_ids: z.array(z.number()).optional().describe("Specific KPI definition IDs to calculate."),
        report_period_id: z.number().optional().describe("Report period ID. If omitted, uses the latest period."),
        year: z.number().optional().describe("Year to query (e.g. 2023). Resolves to the matching report period."),
        hypothetical_values: z.record(z.string(), z.number()).optional().describe("Hypothetical variable values for what-if analysis. E.g. {'Customer Minutes Lost': 5000, 'Customers Served': 10000} to see what SAIDI would be under those conditions."),
        sensitivity_variable: z.string().optional().describe("Variable name to run sensitivity analysis on. Varies the variable by -50%, -25%, -10%, +10%, +25%, +50% and returns how the KPI result changes at each level."),
      }),
      execute: async ({ kpi_names, kpi_def_ids, report_period_id, year, hypothetical_values, sensitivity_variable }) => {
        return withTimeout(
          calculateKpis(user, { kpi_names, kpi_def_ids, report_period_id, year, hypothetical_values: hypothetical_values as Record<string, number>, sensitivity_variable }),
          "calculate_kpi",
        );
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

    get_review_queue: tool({
      description:
        "Get the review/approval queue for a report period. Shows which KPIs are stuck, who needs to act on them, and counts by status and owner. Use this when the user asks what needs to be reviewed, what's pending approval, or who is responsible for stuck items.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Report period ID."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
      }),
      execute: async ({ report_period_id, year }) => {
        return withTimeout(getReviewQueue(user, { report_period_id, year }), "get_review_queue");
      },
    }),

    get_input_status: tool({
      description:
        "Get the status of individual inputs for a specific KPI. Shows which data entry fields are filled, which are missing, and the formula variables they feed into. Use this when a user asks why a particular KPI is incomplete or what data needs to be entered to complete it.",
      inputSchema: z.object({
        kpi_name: z.string().describe("Name of the KPI to check inputs for (partial match supported)."),
        report_period_id: z.number().optional().describe("Report period ID."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
      }),
      execute: async ({ kpi_name, report_period_id, year }) => {
        return withTimeout(getInputStatus(user, { kpi_name, report_period_id, year }), "get_input_status");
      },
    }),

    explain_kpi: tool({
      description:
        "Explain what a KPI is, how it's calculated, what category it belongs to, and what its benchmarking limits are. Use this when the user asks 'what does X mean?' or 'how is Y calculated?'.",
      inputSchema: z.object({
        kpi_name: z.string().describe("KPI name to explain (partial match)."),
        kpi_def_id: z.number().optional().describe("Specific KPI definition ID."),
      }),
      execute: async ({ kpi_name, kpi_def_id }) => {
        return withTimeout(explainKpi({ kpi_name, kpi_def_id }), "explain_kpi");
      },
    }),

    get_custom_kpi_status: tool({
      description:
        "Get the status of custom KPI requests in the pipeline. Shows pending, approved, and rejected custom KPI proposals.",
      inputSchema: z.object({}),
      execute: async () => {
        return withTimeout(getCustomKpiStatus(), "get_custom_kpi_status");
      },
    }),

    get_service_area_breakdown: tool({
      description:
        "Get performance breakdown by service area within a utility. Shows KPI counts, completeness, and approval status per service area.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Report period ID."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
      }),
      execute: async ({ report_period_id, year }) => {
        return withTimeout(getServiceAreaBreakdown(user, { report_period_id, year }), "get_service_area_breakdown");
      },
    }),

    get_peer_group_analysis: tool({
      description:
        "Benchmark the user's utility against a peer group of similar utilities. Shows rankings, group averages, and where the user's utility stands.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Report period ID."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
        group_by: z.enum(["country", "size", "region"]).optional().describe("How to group peers."),
        group_value: z.string().optional().describe("The specific group value."),
      }),
      execute: async ({ report_period_id, year, group_by, group_value }) => {
        return withTimeout(getPeerGroupAnalysis(user, { report_period_id, year, group_by, group_value }), "get_peer_group_analysis");
      },
    }),

    get_risk_assessment: tool({
      description:
        "Assess risk across utilities. Computes a risk score (0-100) based on completion gaps, pending rates, approval backlogs, and governance issues. Returns risk profiles sorted by severity with flags explaining each risk.",
      inputSchema: z.object({
        all_utilities: z.boolean().optional().describe("Set to true to assess risk across all utilities."),
      }),
      execute: async ({ all_utilities }) => {
        return withTimeout(getRiskAssessment(user, { all_utilities }), "get_risk_assessment");
      },
    }),

    get_data_quality_report: tool({
      description:
        "Scan KPI values for data quality issues: negative values, values outside expected ranges, and anomalous jumps. Returns flagged values with severity and descriptions.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Report period ID to scan."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
      }),
      execute: async ({ report_period_id, year }) => {
        return withTimeout(getDataQualityReport(user, { report_period_id, year }), "get_data_quality_report");
      },
    }),

    compare_periods: tool({
      description:
        "Compare two report periods side-by-side. Shows completion rates, KPI counts, pending/entered/reviewed/approved counts, and the delta between periods with direction (improved/declined/stable).",
      inputSchema: z.object({
        period_a_id: z.number().optional().describe("First period ID (older)."),
        period_b_id: z.number().optional().describe("Second period ID (newer)."),
        year_a: z.number().optional().describe("First year to compare (e.g. 2022)."),
        year_b: z.number().optional().describe("Second year to compare (e.g. 2023)."),
      }),
      execute: async ({ period_a_id, period_b_id, year_a, year_b }) => {
        return withTimeout(comparePeriods(user, { period_a_id, period_b_id, year_a, year_b }), "compare_periods");
      },
    }),

    get_what_changed: tool({
      description:
        "Detect what changed between the latest two periods. Automatically identifies the KPIs with the biggest value changes (up or down) and ranks them by magnitude.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Report period ID (defaults to latest)."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
      }),
      execute: async ({ report_period_id, year }) => {
        return withTimeout(getWhatChanged(user, { report_period_id, year }), "get_what_changed");
      },
    }),

    get_compliance_status: tool({
      description:
        "Check KPI values against regulatory limits. Flags values below minimum thresholds, above maximums, and negative values. Returns critical issues and warnings ranked by severity. Use this when asked about regulatory compliance, whether utilities meet standards, or which KPIs are out of acceptable range.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Report period ID."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
        all_utilities: z.boolean().optional().describe("Set to true to check compliance across all utilities."),
      }),
      execute: async ({ report_period_id, year, all_utilities }) => {
        return withTimeout(getComplianceStatus(user, { report_period_id, year, all_utilities }), "get_compliance_status");
      },
    }),

    get_kpi_targets: tool({
      description:
        "Compute peer-benchmark KPI targets. Calculates median, top quartile, and bottom quartile values for each KPI across utilities, then suggests realistic improvement targets. Use this when asked about target-setting, performance goals, or where a utility should aim.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Report period ID."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
        month: z.number().optional().describe("Month (1-12) for monthly granularity."),
        all_utilities: z.boolean().optional().describe("Set to true for cross-utility benchmarks."),
      }),
      execute: async ({ report_period_id, year, month, all_utilities }) => {
        return withTimeout(getKpiTargets(user, { report_period_id, year, month, all_utilities }), "get_kpi_targets");
      },
    }),

    get_kpi_correlation: tool({
      description:
        "Compute correlations between KPIs across utilities. Answers questions like 'do utilities with high system losses also have high SAIDI?' Returns Pearson correlation coefficients.",
      inputSchema: z.object({
        report_period_id: z.number().optional().describe("Report period ID."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
        month: z.number().optional().describe("Month (1-12) for monthly granularity."),
      }),
      execute: async ({ report_period_id, year, month }) => {
        return withTimeout(getKpiCorrelation(user, { report_period_id, year, month }), "get_kpi_correlation");
      },
    }),

    compare_kpis_across_utilities: tool({
      description:
        "Compare actual KPI values across multiple utilities. Returns per-utility values with rankings. Use this to compare specific KPI performance across utilities.",
      inputSchema: z.object({
        kpi_names: z.array(z.string()).describe("KPI names to compare (e.g. ['SAIDI', 'System Loss'])."),
        report_period_id: z.number().optional().describe("Report period ID."),
        year: z.number().optional().describe("Year to query (e.g. 2023)."),
        month: z.number().optional().describe("Month (1-12) for monthly granularity."),
      }),
      execute: async ({ kpi_names, report_period_id, year, month }) => {
        return withTimeout(compareKpisAcrossUtilities(user, { kpi_names, report_period_id, year, month }), "compare_kpis_across_utilities");
      },
    }),

    generate_export: tool({
      description:
        "Generate a downloadable CSV or Excel report from analysis results. Use when the user asks to export results, create a report, or download data.",
      inputSchema: z.object({
        title: z.string().describe("Report title."),
        columns: z.array(z.string()).describe("Column headers."),
        rows: z.array(z.array(z.union([z.string(), z.number()]))).describe("Row data."),
        format: z.enum(["csv", "excel"]).describe("Export format."),
      }),
      execute: async ({ title, columns, rows, format }) => {
        return withTimeout(generateExport(user, { title, columns, rows: rows as Array<Array<string | number>>, format }), "generate_export");
      },
    }),

    get_country_hierarchy: tool({
      description:
        "Get the country and sub-region hierarchy for the Pacific region. Returns countries grouped by sub-region with ISO codes, UN regional classifications, and ADB membership.",
      inputSchema: z.object({}),
      execute: async () => {
        return withTimeout(getCountryHierarchy(), "get_country_hierarchy");
      },
    }),

    get_industry_benchmarks: tool({
      description:
        "Get industry-standard benchmarks for Pacific electricity utility KPIs. Includes SAIDI, SAIFI, system losses, tariff recovery, electrification rate, renewable penetration, and more. Provides developing nation, developed nation, and Pacific regional averages plus PPA targets. Source data from World Bank, ADB, IRENA, and PPA Benchmarking Reports. Use this to contextualise performance — 'You are at 320 minutes — the PPA target is 360, the top quartile is 120.'",
      inputSchema: z.object({}),
      execute: async () => {
        return withTimeout(getIndustryBenchmarks(), "get_industry_benchmarks");
      },
    }),

    get_executive_digest: tool({
      description:
        "Generate an executive briefing digest. Tells the LLM which tools to call to produce a structured summary with key metrics, trends, top actions, risks, and benchmark context. Use this when asked for a summary, briefing, highlights, or 'what should I know for my Monday meeting?'",
      inputSchema: z.object({}),
      execute: async () => {
        return withTimeout(getExecutiveDigest(), "get_executive_digest");
      },
    }),

    get_review_queue_entries: tool({
      description:
        "View the AI review queue — flagged conversations that need human review. Shows pending and reviewed entries with status. Admin only (DEV/BMO).",
      inputSchema: z.object({}),
      execute: async () => {
        return withTimeout(getReviewQueueEntries(user), "get_review_queue_entries");
      },
    }),

    get_guided_entry: tool({
      description:
        "Get step-by-step guidance for entering data for a specific KPI. Tells the user which inputs to fill, where to find them in PRISM, and what values are expected.",
      inputSchema: z.object({
        kpi_name: z.string().describe("Name of the KPI to get data entry guidance for."),
      }),
      execute: async ({ kpi_name }) => {
        return withTimeout(getGuidedEntry(user, { kpi_name }), "get_guided_entry");
      },
    }),

    query_power_bi: tool({
      description:
        "Query a Power BI dataset using DAX. First use discover_datasets to find available datasets, then discover_schema to see tables/columns/measures in a dataset, then run custom DAX queries. Requires Power BI to be configured.",
      inputSchema: z.object({
        custom_dax: z.string().optional().describe("Custom DAX query. Use EVALUATE table_name or EVALUATE SUMMARIZECOLUMNS(...)."),
        dataset_id: z.string().optional().describe("Specific dataset ID to query. Use the ID from discover_datasets."),
      }),
      execute: async ({ custom_dax, dataset_id }) => {
        if (!isConfiguredForDax()) {
          logger.warn("[powerbi] Power BI not configured for DAX (query_power_bi)", { userId: user.id });
          return { data: { rows: [], columns: [], row_count: 0, query_summary: "" }, error: "Power BI is not configured." } satisfies AiToolResult<PowerBiData>;
        }
        return withTimeout(queryPowerBi({ custom_dax, dataset_id }), "query_power_bi");
      },
    }),

    diagnose_power_bi: tool({
      description:
        "Diagnose the Power BI connection. Tests whether the service principal can access datasets and lists available datasets with IDs. Requires Power BI to be configured.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!isConfiguredForDax()) {
          logger.warn("[powerbi] Power BI not configured for DAX (diagnose_power_bi)", { userId: user.id });
          return { data: { ok: false, datasets_accessible: false, message: "Power BI is not configured." } } satisfies AiToolResult<DiagnosticData>;
        }
        return withTimeout(diagnosePowerBi(), "diagnose_power_bi");
      },
    }),

    discover_datasets: tool({
      description:
        "List all Power BI datasets available. Returns dataset names, IDs, and metadata. Requires Power BI to be configured.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!isConfiguredForDax()) {
          logger.warn("[powerbi] Power BI not configured for DAX (discover_datasets)", { userId: user.id });
          return { data: { datasets: [], total_datasets: 0 }, error: "Power BI is not configured." } satisfies AiToolResult<DiscoveryData>;
        }
        return withTimeout(discoverDatasets(), "discover_datasets");
      },
    }),

    discover_schema: tool({
      description:
        "Get the full schema of a Power BI dataset. Returns all table names (auto-discovered), measures, and column structure for the first 10 tables. Pass table_names to get columns for specific tables. Requires Power BI to be configured.",
      inputSchema: z.object({
        dataset_id: z.string().optional().describe("Dataset ID from discover_datasets. Uses default if omitted."),
        table_names: z.array(z.string()).optional().describe("Specific tables to get column details for. If omitted, columns are discovered for the first 10 tables."),
      }),
      execute: async ({ dataset_id, table_names }) => {
        if (!isConfiguredForDax()) {
          logger.warn("[powerbi] Power BI not configured for DAX (discover_schema)", { userId: user.id });
          return { data: { dataset_id: dataset_id || "default", tables: [], total_tables: 0 }, error: "Power BI is not configured." } satisfies AiToolResult<SchemaData>;
        }
        return withTimeout(discoverSchema({ dataset_id, table_names }), "discover_schema", PBI_TOOL_TIMEOUT_MS);
      },
    }),

    discover_report: tool({
      description:
        "Discover the pages in a Power BI report. Lists all pages with names and order. Requires Power BI to be configured.",
      inputSchema: z.object({
        report_id: z.string().optional().describe("Report ID. Uses the default POWERBI_REPORT_ID if omitted."),
      }),
      execute: async ({ report_id }) => {
        if (!isConfigured()) {
          logger.warn("[powerbi] Power BI not configured (discover_report)", { userId: user.id });
          return { data: { pages: [], report_id: report_id || "default" }, error: "Power BI is not configured." } satisfies AiToolResult<ReportData>;
        }
        return withTimeout(discoverReport({ report_id }), "discover_report");
      },
    }),

    // ── Power BI Schema & Query Tools (instant, no discovery needed) ──

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
        "Run a pre-built, tested Power BI query. Much faster than writing custom DAX. Use pbi_query_catalog for full list. Use pbi_match to find the right query from natural language. Key queries: saidi_by_utility, saifi_by_utility, reliability_summary, installed_capacity, installed_capacity_by_utility, generation_output, generation_by_source, peak_demand, system_losses, distribution_overview, financial_summary, cost_recovery, customer_overview, metering_summary, workforce_summary, safety_summary, utility_profile, peer_comparison, composite_score, whatif_sensitivity, saidi_trend, generation_trend, losses_trend, recovery_trend, electrification_trend.",
      inputSchema: z.object({
        query: z.string().describe("Query template name. Use pbi_query_catalog for full list or pbi_match for NL matching."),
        params: z.record(z.string()).optional().describe("Query parameters. Context defaults (utility, fy) from pbi_context are auto-applied if set."),
      }),
      execute: async ({ query, params }) => {
        if (!isConfiguredForDax()) {
          return { error: "Power BI is not configured for DAX queries." };
        }
        return runPbiQuery({ query, params });
      },
    }),

    pbi_match: tool({
      description: "Match a natural language question to the best Power BI query template. Use this when you're not sure which query to use.",
      inputSchema: z.object({
        question: z.string().describe("The user's question in their own words."),
      }),
      execute: async ({ question }) => {
        return resolveNlQuery(question);
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
        if (clear) {
          return { context: setPbiContext({}), message: "Context cleared." };
        }
        const ctx = setPbiContext({ utility, fy });
        return { context: ctx, message: Object.keys(ctx).length > 0 ? "Context updated." : "No context set." };
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
        if (!isConfiguredForDax()) {
          return { error: "Power BI is not configured for DAX queries." };
        }
        return runPbiQuery({ query, params });
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
};

export type AiTools = ReturnType<typeof createAiTools>;
