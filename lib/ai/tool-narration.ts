import type { AiToolName } from "./types";

// Plain-English, present-tense narration for each tool so the "Thinking" panel
// reads like a person explaining what they're doing, not a log of function names.
const TOOL_NARRATION: Record<AiToolName, string> = {
  get_kpi_status: "Checking your KPI submission status",
  get_benchmarking_data: "Pulling in benchmarking data to compare against",
  get_completeness_breakdown: "Reviewing how complete your data submissions are",
  get_trend_analysis: "Looking at submission trends over time",
  get_anomaly_insights: "Scanning for anything unusual in the data",
  get_governance_audit: "Checking the governance and audit trail",
  get_configuration_options: "Looking up the available configuration options",
  get_kpi_diagnostics: "Digging into why this KPI's numbers look off",
  render_visualization: "Putting together a chart to show you",
  suggest_follow_ups: "Thinking of some good follow-up questions",
  calculate_kpi: "Running the numbers for this calculation",
  dashboard_link: "Finding the right dashboard for you",
  get_review_queue: "Checking the AI review queue",
  get_input_status: "Checking which data inputs are still missing",
  explain_kpi: "Looking up how this KPI is defined and calculated",
  get_custom_kpi_status: "Checking the status of your custom KPI",
  get_service_area_breakdown: "Breaking this down by service area",
  get_peer_group_analysis: "Comparing you against your peer group of utilities",
  get_risk_assessment: "Assessing the risk level here",
  get_data_quality_report: "Running a data quality check",
  compare_periods: "Comparing this reporting period against others",
  get_what_changed: "Working out what's changed since last time",
  get_compliance_status: "Checking compliance status",
  get_kpi_targets: "Looking up the targets set for this KPI",
  get_kpi_correlation: "Checking how these KPIs relate to each other",
  compare_kpis_across_utilities: "Comparing this KPI across utilities",
  drill_measure: "Drilling into the underlying data",
  generate_export: "Preparing an export of this data",
  get_country_hierarchy: "Looking up the country and regional structure",
  get_industry_benchmarks: "Pulling in industry benchmark figures",
  get_executive_digest: "Putting together an executive summary",
  get_review_queue_entries: "Fetching entries from the review queue",
  get_guided_entry: "Working out the data entry steps you'll need",
  query_power_bi: "Querying the Power BI dataset",
  diagnose_power_bi: "Diagnosing an issue with the Power BI connection",
  discover_datasets: "Checking what datasets are available",
  discover_schema: "Looking at the data schema",
  discover_report: "Looking through the available reports",
  get_ai_usage: "Checking AI usage figures",
  pbi_schema: "Checking the Power BI data schema",
  pbi_query: "Querying Power BI for the data you need",
  pbi_query_catalog: "Searching the Power BI data catalog",
  pbi_match: "Matching this up against the right Power BI dataset",
  pbi_context: "Gathering some background context from Power BI",
  pbi_freshness: "Checking how up to date the Power BI data is",
  pbi_chart: "Building a chart from the Power BI data",
  pbi_anomalies: "Scanning the Power BI data for anomalies",
  pbi_deeplink: "Building a link straight to the relevant Power BI report",
  pbi_export: "Preparing a Power BI export",
  pbi_trend: "Checking trends in the Power BI data",
  pbi_risk_score: "Calculating a risk score from the Power BI data",
  pbi_report: "Pulling up the relevant Power BI report",
  pbi_alerts: "Checking for any alerts in Power BI",
  pbi_peer_groups: "Comparing you against peer utilities in Power BI",
  pbi_donor_reports: "Looking up donor reporting data",
  pbi_renewable_scenario: "Modelling a renewable energy scenario",
  pbi_forecast: "Forecasting ahead based on the data",
  pbi_best_worst: "Finding the best and worst performers",
  pbi_similar_utilities: "Finding utilities that are similar to yours",
  pbi_correlations: "Checking for correlations in the data",
  pbi_prioritize: "Working out what to prioritise",
  pbi_briefing: "Putting together a briefing",
  pbi_completeness: "Checking data completeness in Power BI",
  pbi_regulatory: "Checking regulatory requirements",
  pbi_training: "Looking up training and reference material",
  pbi_tariff_sim: "Running a tariff simulation",
  pbi_donor_fill: "Checking for donor-funded data gaps",
  pbi_project_impact: "Assessing project impact",
};

// Fallback for any tool added later without a narration entry yet — turns
// "some_new_tool_name" into "Working on some new tool name" rather than
// showing the raw identifier.
const humanize = (toolName: string): string =>
  `Working on ${toolName.replace(/^pbi_/, "").split("_").join(" ")}`;

export const describeToolCall = (toolName: string): string =>
  TOOL_NARRATION[toolName as AiToolName] ?? humanize(toolName);

export const NO_DATA_NARRATION =
  "That didn't return any data — let me try a different approach";
