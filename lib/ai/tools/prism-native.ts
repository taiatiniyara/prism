import { z } from "zod";
import { tool } from "ai";
import type { CurrentUser } from "@/lib/user.service";
import type { AiToolResult } from "../types";
import { isConfiguredForDax, isConfigured } from "@/lib/powerbi.service";
import { validateToolAccess } from "../guardrails";
import { logger } from "@/lib/logger";
import {
  getKpiStatus, getBenchmarkingData, getCompletenessBreakdown, getTrendAnalysis,
  getAnomalyInsights, getGovernanceAudit, getConfigurationOptions, getKpiDiagnostics,
  calculateKpis, getReviewQueue, getInputStatus, explainKpi, getCustomKpiStatus,
  getServiceAreaBreakdown, getPeerGroupAnalysis, getRiskAssessment, getDataQualityReport,
  getWhatChanged, comparePeriods, type CompletenessDimension, getComplianceStatus,
  getKpiTargets, getKpiCorrelation, compareKpisAcrossUtilities, generateExport,
  getCountryHierarchy, getIndustryBenchmarks, getExecutiveDigest, getReviewQueueEntries,
  getGuidedEntry, queryPowerBi, diagnosePowerBi, discoverDatasets, discoverSchema,
  discoverReport, getWorldBankCountryContext, resolveUserIsoCode,
  type PowerBiData, type DiagnosticData, type DiscoveryData, type SchemaData, type ReportData,
} from "../data-service";

import { PBI_TOOL_TIMEOUT_MS, withTimeout } from "./utils";

export function createPrismNativeTools(user: CurrentUser, _abortSignal?: AbortSignal, _sessionId?: number) {
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

    get_worldbank_context: tool({
      description:
        "Get live World Bank country context for a Pacific island nation. Returns income classification (LIC/LMIC/UMIC/HIC), lending category (IDA/IBRD/Blend), key development indicators (GDP per capita, population, electricity access %, renewable energy %, CO2 emissions), and active World Bank-funded projects. Use this to anchor recommendations in the country's economic reality — donor eligibility, concessional financing access, and development stage all depend on these classifications. If no country_code is provided, defaults to the user's own country.",
      inputSchema: z.object({
        country_code: z.string().optional().describe("ISO alpha-2 country code (e.g. FJ, WS, PG, SB, VU, KI, TO, CK, NR, TV, FM, MH, PW). Omit to use the user's own country."),
      }),
      execute: async ({ country_code }) => {
        const code = country_code ?? (await resolveUserIsoCode(user));
        if (!code) {
          return {
            error: "Could not determine country. Provide a country_code (ISO alpha-2, e.g. 'FJ' for Fiji) or ensure your account is linked to an organisation with a country.",
          };
        }
        return withTimeout(getWorldBankCountryContext(code), "get_worldbank_context");
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

  };
}
