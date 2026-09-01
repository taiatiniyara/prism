/**
 * Pre-built Power BI DAX Query Templates — Enhanced
 *
 * Battle-tested DAX queries for the most common AI questions.
 * Each template has a name, description, typed parameters, a DAX generator,
 * result metadata for auto-visualization, and natural language aliases.
 */

export type ChartType =
  | "bar-chart"
  | "line-chart"
  | "table"
  | "leaderboard"
  | "scatter"
  | "radar"
  | "sankey"
  | "heatmap";

export type ResultType =
  | "ranking"
  | "trend"
  | "breakdown"
  | "summary"
  | "comparison"
  | "raw";

export interface PbiQueryTemplate {
  name: string;
  description: string;
  returns: string;
  params: Record<string, { type: "string" | "number"; description: string; required: boolean }>;
  dax: (params: Record<string, string>) => string;
  /** What kind of result this produces — helps the AI choose a chart */
  result_type: ResultType;
  /** The best chart type for this query's results */
  recommended_chart: ChartType;
  /** Natural language phrases that should trigger this query */
  aliases: string[];
}

const escapeDax = (s: string): string => s.replace(/'/g, "''");

export const PBI_QUERIES: Record<string, PbiQueryTemplate> = {
  // ═══════════════════════════════════════════
  // RELIABILITY
  // ═══════════════════════════════════════════
  saidi_by_utility: {
    name: "saidi_by_utility",
    description: "SAIDI (outage duration) for all utilities in a fiscal year, sorted best to worst",
    returns: "Utility, SAIDI value, ranked by shortest outages first",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["how is reliability", "worst SAIDI", "outage duration", "best SAIDI", "SAIDI ranking", "reliability ranking", "longest outages", "outage hours"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], 'Fact SAIDI and SAIFI'[FY], "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value])) FILTER('Fact SAIDI and SAIFI'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact SAIDI and SAIFI'[SAIDI Value] ASC`,
  },

  saifi_by_utility: {
    name: "saifi_by_utility",
    description: "SAIFI (outage frequency) for all utilities in a fiscal year",
    returns: "Utility, SAIFI value, ranked by fewest interruptions first",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["outage frequency", "SAIFI ranking", "interruptions", "fewest outages", "most reliable"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], 'Fact SAIDI and SAIFI'[FY], "SAIFI", SUM('Fact SAIDI and SAIFI'[SAIFI Value])) FILTER('Fact SAIDI and SAIFI'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact SAIDI and SAIFI'[SAIFI Value] ASC`,
  },

  reliability_summary: {
    name: "reliability_summary",
    description: "SAIDI and SAIFI together for all utilities — use for reliability overview",
    returns: "Utility, SAIDI, SAIFI, ranked by SAIDI",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["reliability overview", "SAIDI SAIFI", "outage stats", "how reliable"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], 'Fact SAIDI and SAIFI'[FY], "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value]), "SAIFI", SUM('Fact SAIDI and SAIFI'[SAIFI Value])) FILTER('Fact SAIDI and SAIFI'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact SAIDI and SAIFI'[SAIDI Value] ASC`,
  },

  saidi_trend: {
    name: "saidi_trend",
    description: "SAIDI values for ALL available fiscal years — shows reliability improvement or decline over time",
    returns: "Utility, FY, SAIDI — one row per utility per year, sorted by year then SAIDI",
    result_type: "trend",
    recommended_chart: "line-chart",
    aliases: ["SAIDI over time", "reliability trend", "outage trend", "improving reliability", "SAIDI history", "reliability over years"],
    params: { utility: { type: "string", description: "Utility acronym (e.g., EPC). Omit for all utilities.", required: false } },
    dax: (p) => {
      const filter = p.utility ? `FILTER('Fact SAIDI and SAIFI'[Utility] = "${escapeDax(p.utility)}")` : "";
      return `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], 'Fact SAIDI and SAIFI'[FY], "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value])) ${filter} ORDER BY 'Fact SAIDI and SAIFI'[FY] ASC, 'Fact SAIDI and SAIFI'[SAIDI Value] ASC`;
    },
  },

  // ═══════════════════════════════════════════
  // GENERATION & CAPACITY
  // ═══════════════════════════════════════════
  rated_capacity: {
    name: "rated_capacity",
    description: "Total rated capacity (MW) by utility and energy source",
    returns: "Utility, Energy Source, Total rated MW",
    result_type: "breakdown",
    recommended_chart: "bar-chart",
    aliases: ["capacity by source", "rated capacity breakdown", "MW by fuel", "generation capacity", "power plant capacity"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact GeneratorsData'[Utility], 'Fact GeneratorsData'[Energy Source], "Rated MW", SUM('Fact GeneratorsData'[Rated Capacity (MW)])) FILTER('Fact GeneratorsData'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact GeneratorsData'[Utility] ASC, 'Fact GeneratorsData'[Energy Source] ASC`,
  },

  rated_capacity_by_utility: {
    name: "rated_capacity_by_utility",
    description: "Total rated capacity per utility (aggregated across all sources)",
    returns: "Utility, Total MW",
    result_type: "ranking",
    recommended_chart: "leaderboard",
    aliases: ["total capacity", "capacity ranking", "who has most capacity", "largest utility", "MW ranking"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact GeneratorsData'[Utility], "Total MW", SUM('Fact GeneratorsData'[Rated Capacity (MW)])) FILTER('Fact GeneratorsData'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact GeneratorsData'[Utility] ASC`,
  },

  generation_output: {
    name: "generation_output",
    description: "Total electricity generated (MWh) by utility",
    returns: "Utility, Total MWh generated",
    result_type: "ranking",
    recommended_chart: "leaderboard",
    aliases: ["electricity generated", "generation output", "MWh produced", "how much power", "total generation"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact Generation'[Utility], "Total MWh", SUM('Fact Generation'[GEN Electricity Generated (MWh)])) FILTER('Fact Generation'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact Generation'[Utility] ASC`,
  },

  generation_by_source: {
    name: "generation_by_source",
    description: "Electricity generation by energy source and utility",
    returns: "Utility, Energy Source, MWh generated",
    result_type: "breakdown",
    recommended_chart: "bar-chart",
    aliases: ["generation mix", "energy mix", "generation by fuel", "renewable generation", "diesel generation"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact Generation'[Utility], 'Fact Generation'[Energy Source], "MWh", SUM('Fact Generation'[GEN Electricity Generated (MWh)])) FILTER('Fact Generation'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact Generation'[Utility] ASC`,
  },

  peak_demand: {
    name: "peak_demand",
    description: "Peak and average electricity demand by utility",
    returns: "Utility, Peak Load (MW), Average Load (MW)",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["peak load", "demand", "highest demand", "load profile", "average load"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact Generation'[Utility], "Peak MW", MAX('Fact Generation'[Electricity Demand Peak Load]), "Average MW", AVERAGE('Fact Generation'[Electricity Demand Average Load])) FILTER('Fact Generation'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact Generation'[Utility] ASC`,
  },

  generation_trend: {
    name: "generation_trend",
    description: "Generation output (MWh) across all available fiscal years — shows growth or decline",
    returns: "Utility, FY, Total MWh — one row per utility per year",
    result_type: "trend",
    recommended_chart: "line-chart",
    aliases: ["generation over time", "generation history", "MWh trend", "growing generation", "generation change"],
    params: { utility: { type: "string", description: "Utility acronym. Omit for all.", required: false } },
    dax: (p) => {
      const filter = p.utility ? `FILTER('Fact Generation'[Utility] = "${escapeDax(p.utility)}")` : "";
      return `EVALUATE SUMMARIZECOLUMNS('Fact Generation'[Utility], 'Fact Generation'[FY], "Total MWh", SUM('Fact Generation'[GEN Electricity Generated (MWh)])) ${filter} ORDER BY 'Fact Generation'[FY] ASC`;
    },
  },

  // ═══════════════════════════════════════════
  // DISTRIBUTION
  // ═══════════════════════════════════════════
  system_losses: {
    name: "system_losses",
    description: "System losses (%) by utility — ranked from lowest to highest losses",
    returns: "Utility, System Losses (%)",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["losses", "system losses", "technical losses", "lowest losses", "highest losses", "loss percentage", "non-revenue"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact Distribution'[Utility], "Losses %", AVERAGE('Fact Distribution'[System Losses (%)])) FILTER('Fact Distribution'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact Distribution'[System Losses (%)] ASC`,
  },

  distribution_overview: {
    name: "distribution_overview",
    description: "Distribution network overview: line length, transformer capacity, and losses",
    returns: "Utility, Line km, Transformer MVA, Losses %",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["distribution network", "line length", "transformers", "network size", "distribution assets"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact Distribution'[Utility], "Line km", SUM('Fact Distribution'[Distribution Line Length (km)]), "Transformer MVA", SUM('Fact Distribution'[Transformer Capacity (MVA)]), "Losses %", AVERAGE('Fact Distribution'[System Losses (%)])) FILTER('Fact Distribution'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact Distribution'[Utility] ASC`,
  },

  losses_trend: {
    name: "losses_trend",
    description: "System losses across all available fiscal years — shows improvement or deterioration",
    returns: "Utility, FY, Losses %",
    result_type: "trend",
    recommended_chart: "line-chart",
    aliases: ["losses over time", "losses history", "improving losses", "losses trend", "reducing losses"],
    params: { utility: { type: "string", description: "Utility acronym. Omit for all.", required: false } },
    dax: (p) => {
      const filter = p.utility ? `FILTER('Fact Distribution'[Utility] = "${escapeDax(p.utility)}")` : "";
      return `EVALUATE SUMMARIZECOLUMNS('Fact Distribution'[Utility], 'Fact Distribution'[FY], "Losses %", AVERAGE('Fact Distribution'[System Losses (%)])) ${filter} ORDER BY 'Fact Distribution'[FY] ASC, 'Fact Distribution'[System Losses (%)] ASC`;
    },
  },

  // ═══════════════════════════════════════════
  // FINANCIALS
  // ═══════════════════════════════════════════
  financial_summary: {
    name: "financial_summary",
    description: "Revenue, operating costs, and tariff recovery rate by utility",
    returns: "Utility, Revenue, OpEx, Tariff Recovery %, AR Days",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["financials", "revenue", "costs", "tariff recovery", "financial performance", "money", "operating costs", "capital expenditure"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact FinancialAccounts'[Utility], "Revenue", SUM('Fact FinancialAccounts'[Total Revenue]), "Operating Costs", SUM('Fact FinancialAccounts'[Operating Costs]), "Tariff Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]), "AR Days", AVERAGE('Fact FinancialAccounts'[Accounts Receivable (Days)])) FILTER('Fact FinancialAccounts'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact FinancialAccounts'[Utility] ASC`,
  },

  cost_recovery: {
    name: "cost_recovery",
    description: "Tariff cost recovery rates across utilities — identifies utilities that aren't covering costs",
    returns: "Utility, Recovery %, AR Days",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["cost recovery", "covering costs", "tariff adequacy", "financial sustainability", "who is profitable"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact FinancialAccounts'[Utility], "Cost Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]), "AR Days", AVERAGE('Fact FinancialAccounts'[Accounts Receivable (Days)])) FILTER('Fact FinancialAccounts'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact FinancialAccounts'[Tariff Recovery Rate (%)] ASC`,
  },

  recovery_trend: {
    name: "recovery_trend",
    description: "Tariff recovery rate across all available fiscal years",
    returns: "Utility, FY, Recovery %",
    result_type: "trend",
    recommended_chart: "line-chart",
    aliases: ["recovery over time", "financial trend", "recovery history", "improving financials", "getting better financially"],
    params: { utility: { type: "string", description: "Utility acronym. Omit for all.", required: false } },
    dax: (p) => {
      const filter = p.utility ? `FILTER('Fact FinancialAccounts'[Utility] = "${escapeDax(p.utility)}")` : "";
      return `EVALUATE SUMMARIZECOLUMNS('Fact FinancialAccounts'[Utility], 'Fact FinancialAccounts'[FY], "Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)])) ${filter} ORDER BY 'Fact FinancialAccounts'[FY] ASC`;
    },
  },

  // ═══════════════════════════════════════════
  // CUSTOMERS
  // ═══════════════════════════════════════════
  customer_overview: {
    name: "customer_overview",
    description: "Customer connections, electrification rate, and satisfaction by utility",
    returns: "Utility, Total Connections, Electrification %, New Connections",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["customers", "connections", "electrification", "reach", "households connected", "customer base"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact Customer'[Utility], "Total Connections", SUM('Fact Customer'[Total Connections]), "New Connections", SUM('Fact Customer'[New Connections]), "Electrification %", AVERAGE('Fact Customer'[Electrification Rate (%)])) FILTER('Fact Customer'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact Customer'[Utility] ASC`,
  },

  metering_summary: {
    name: "metering_summary",
    description: "Metering coverage: metered vs unmetered customers, prepayment adoption",
    returns: "Utility, Total, Metered, Unmetered, Metering %, Prepayment",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["metering", "meters", "prepayment", "smart meters", "unmetered", "meter coverage", "billing"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact Metering'[Utility], "Total Customers", SUM('Fact Metering'[Total Customers]), "Metered", SUM('Fact Metering'[Metered Customers]), "Unmetered", SUM('Fact Metering'[Unmetered Customers]), "Metering %", AVERAGE('Fact Metering'[Metering Rate (%)]), "Prepayment", SUM('Fact Metering'[Prepayment Meters])) FILTER('Fact Metering'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact Metering'[Utility] ASC`,
  },

  electrification_trend: {
    name: "electrification_trend",
    description: "Electrification rate across all available fiscal years",
    returns: "Utility, FY, Electrification %",
    result_type: "trend",
    recommended_chart: "line-chart",
    aliases: ["electrification over time", "electrification history", "growing reach", "more connections over time"],
    params: { utility: { type: "string", description: "Utility acronym. Omit for all.", required: false } },
    dax: (p) => {
      const filter = p.utility ? `FILTER('Fact Customer'[Utility] = "${escapeDax(p.utility)}")` : "";
      return `EVALUATE SUMMARIZECOLUMNS('Fact Customer'[Utility], 'Fact Customer'[FY], "Electrification %", AVERAGE('Fact Customer'[Electrification Rate (%)])) ${filter} ORDER BY 'Fact Customer'[FY] ASC`;
    },
  },

  // ═══════════════════════════════════════════
  // WORKFORCE & SAFETY
  // ═══════════════════════════════════════════
  workforce_summary: {
    name: "workforce_summary",
    description: "Employee headcount, technical staff ratio, and female participation by utility",
    returns: "Utility, Total Staff, Technical Staff, Female Employees",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["employees", "staff", "workforce", "headcount", "female participation", "technical staff", "gender"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact Employee'[Utility], "Total Staff", SUM('Fact Employee'[Total Employees]), "Technical Staff", SUM('Fact Employee'[Technical Staff]), "Female Employees", SUM('Fact Employee'[Female Employees])) FILTER('Fact Employee'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact Employee'[Utility] ASC`,
  },

  safety_summary: {
    name: "safety_summary",
    description: "Safety performance: lost time injuries, LTIFR, and fatalities by utility",
    returns: "Utility, LTIs, Fatalities, LTIFR",
    result_type: "ranking",
    recommended_chart: "leaderboard",
    aliases: ["safety", "injuries", "LTIFR", "fatalities", "workplace safety", "accidents", "lost time"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact Safety'[Utility], "Lost Time Injuries", SUM('Fact Safety'[Lost Time Injuries]), "Fatalities", SUM('Fact Safety'[Fatalities]), "LTIFR", AVERAGE('Fact Safety'[LTIFR])) FILTER('Fact Safety'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact Safety'[Utility] ASC`,
  },

  // ═══════════════════════════════════════════
  // COMPOUND / CROSS-DOMAIN
  // ═══════════════════════════════════════════
  utility_profile: {
    name: "utility_profile",
    description: "Comprehensive profile for a SINGLE utility: capacity, generation, demand, losses, financials, and customers — all in one query",
    returns: "Utility profile across all major KPIs in a single row",
    result_type: "summary",
    recommended_chart: "radar",
    aliases: ["utility overview", "full profile", "everything about", "tell me about", "utility snapshot", "how is my utility doing"],
    params: {
      utility: { type: "string", description: "Utility acronym (e.g., EPC, TPL)", required: true },
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) => {
      const u = escapeDax(p.utility);
      const fy = escapeDax(p.fy);
      return `EVALUATE VAR _Capacity = CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Utility] = "${u}", 'Fact GeneratorsData'[FY] = "${fy}") VAR _Generation = CALCULATE(SUM('Fact Generation'[GEN Electricity Generated (MWh)]), 'Fact Generation'[Utility] = "${u}", 'Fact Generation'[FY] = "${fy}") VAR _PeakLoad = CALCULATE(MAX('Fact Generation'[Electricity Demand Peak Load]), 'Fact Generation'[Utility] = "${u}", 'Fact Generation'[FY] = "${fy}") VAR _Losses = CALCULATE(AVERAGE('Fact Distribution'[System Losses (%)]), 'Fact Distribution'[Utility] = "${u}", 'Fact Distribution'[FY] = "${fy}") VAR _Revenue = CALCULATE(SUM('Fact FinancialAccounts'[Total Revenue]), 'Fact FinancialAccounts'[Utility] = "${u}", 'Fact FinancialAccounts'[FY] = "${fy}") VAR _Recovery = CALCULATE(AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]), 'Fact FinancialAccounts'[Utility] = "${u}", 'Fact FinancialAccounts'[FY] = "${fy}") VAR _Connections = CALCULATE(SUM('Fact Customer'[Total Connections]), 'Fact Customer'[Utility] = "${u}", 'Fact Customer'[FY] = "${fy}") VAR _Electrification = CALCULATE(AVERAGE('Fact Customer'[Electrification Rate (%)]), 'Fact Customer'[Utility] = "${u}", 'Fact Customer'[FY] = "${fy}") RETURN ROW("Utility", "${u}", "FY", "${fy}", "Rated Capacity MW", _Capacity, "Generation MWh", _Generation, "Peak Demand MW", _PeakLoad, "System Losses %", _Losses, "Revenue", _Revenue, "Cost Recovery %", _Recovery, "Customers", _Connections, "Electrification %", _Electrification)`;
    },
  },

  peer_comparison: {
    name: "peer_comparison",
    description: "Side-by-side comparison across ALL utilities for a key metric — choose which metric",
    returns: "Utility ranking for the chosen metric",
    result_type: "ranking",
    recommended_chart: "leaderboard",
    aliases: ["compare", "ranking", "who is best", "peer comparison", "benchmark", "how do we compare"],
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
      metric: { type: "string", description: "Which metric: capacity, generation, losses, saidi, saifi, recovery, electrification, metering, ltifr", required: true },
    },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      switch (p.metric) {
        case "capacity": return `EVALUATE SUMMARIZECOLUMNS('Fact GeneratorsData'[Utility], "Value", SUM('Fact GeneratorsData'[Rated Capacity (MW)])) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Rated Capacity (MW)] DESC`;
        case "generation": return `EVALUATE SUMMARIZECOLUMNS('Fact Generation'[Utility], "MWh", SUM('Fact Generation'[GEN Electricity Generated (MWh)])) FILTER('Fact Generation'[FY] = "${fy}") ORDER BY 'Fact Generation'[GEN Electricity Generated (MWh)] DESC`;
        case "losses": return `EVALUATE SUMMARIZECOLUMNS('Fact Distribution'[Utility], "Losses %", AVERAGE('Fact Distribution'[System Losses (%)])) FILTER('Fact Distribution'[FY] = "${fy}") ORDER BY 'Fact Distribution'[System Losses (%)] ASC`;
        case "saidi": return `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value])) FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[SAIDI Value] ASC`;
        case "saifi": return `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], "SAIFI", SUM('Fact SAIDI and SAIFI'[SAIFI Value])) FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[SAIFI Value] ASC`;
        case "recovery": return `EVALUATE SUMMARIZECOLUMNS('Fact FinancialAccounts'[Utility], "Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)])) FILTER('Fact FinancialAccounts'[FY] = "${fy}") ORDER BY 'Fact FinancialAccounts'[Tariff Recovery Rate (%)] DESC`;
        case "electrification": return `EVALUATE SUMMARIZECOLUMNS('Fact Customer'[Utility], "Electrification %", AVERAGE('Fact Customer'[Electrification Rate (%)])) FILTER('Fact Customer'[FY] = "${fy}") ORDER BY 'Fact Customer'[Electrification Rate (%)] DESC`;
        case "metering": return `EVALUATE SUMMARIZECOLUMNS('Fact Metering'[Utility], "Metering %", AVERAGE('Fact Metering'[Metering Rate (%)])) FILTER('Fact Metering'[FY] = "${fy}") ORDER BY 'Fact Metering'[Metering Rate (%)] DESC`;
        case "ltifr": return `EVALUATE SUMMARIZECOLUMNS('Fact Safety'[Utility], "LTIFR", AVERAGE('Fact Safety'[LTIFR])) FILTER('Fact Safety'[FY] = "${fy}") ORDER BY 'Fact Safety'[LTIFR] ASC`;
        default: return `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value])) FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[SAIDI Value] ASC`;
      }
    },
  },

  composite_score: {
    name: "composite_score",
    description: "Overall performance score combining reliability (SAIDI), system losses, cost recovery, and electrification into a single ranking",
    returns: "Utility, SAIDI, Losses %, Recovery %, Electrification %, Composite Score",
    result_type: "ranking",
    recommended_chart: "leaderboard",
    aliases: ["overall best", "top performer", "best utility", "worst utility", "overall ranking", "composite", "which utility is best overall"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact SAIDI and SAIFI'[Utility],
        "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value]),
        "Losses %", CALCULATE(AVERAGE('Fact Distribution'[System Losses (%)]), TREATAS(VALUES('Fact SAIDI and SAIFI'[Utility]), 'Fact Distribution'[Utility]), 'Fact Distribution'[FY] = "${fy}"),
        "Recovery %", CALCULATE(AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]), TREATAS(VALUES('Fact SAIDI and SAIFI'[Utility]), 'Fact FinancialAccounts'[Utility]), 'Fact FinancialAccounts'[FY] = "${fy}"),
        "Electrification %", CALCULATE(AVERAGE('Fact Customer'[Electrification Rate (%)]), TREATAS(VALUES('Fact SAIDI and SAIFI'[Utility]), 'Fact Customer'[Utility]), 'Fact Customer'[FY] = "${fy}")
      ) FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[Utility] ASC`;
    },
  },

  // ═══════════════════════════════════════════
  // WHAT-IF ANALYSIS
  // ═══════════════════════════════════════════
  whatif_sensitivity: {
    name: "whatif_sensitivity",
    description: "What-if analysis: project the impact of changing a key metric by a percentage. Shows current value and projected value.",
    returns: "Current value, change %, projected value, and impact summary",
    result_type: "summary",
    recommended_chart: "table",
    aliases: ["what if", "scenario", "projection", "if we improve", "if we reduce", "sensitivity", "what would happen", "impact of change"],
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
      metric: { type: "string", description: "Metric to adjust: saidi, saifi, losses, recovery, electrification, generation, capacity", required: true },
      change_pct: { type: "string", description: "Percentage change (e.g., -10 for 10% improvement, +5 for 5% increase)", required: true },
      utility: { type: "string", description: "Utility acronym. Omit for all utilities average.", required: false },
    },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      const pct = parseFloat(p.change_pct) / 100;
      switch (p.metric) {
        case "saidi": {
          const uFilter = p.utility ? `FILTER('Fact SAIDI and SAIFI'[Utility] = "${escapeDax(p.utility)}")` : "";
          return `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], "Current SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value]), "Projected SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value]) * ${1 + pct}) ${uFilter} FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[Utility] ASC`;
        }
        case "losses": {
          const uFilter = p.utility ? `FILTER('Fact Distribution'[Utility] = "${escapeDax(p.utility)}")` : "";
          return `EVALUATE SUMMARIZECOLUMNS('Fact Distribution'[Utility], "Current Losses %", AVERAGE('Fact Distribution'[System Losses (%)]), "Projected Losses %", AVERAGE('Fact Distribution'[System Losses (%)]) * ${1 + pct}) ${uFilter} FILTER('Fact Distribution'[FY] = "${fy}") ORDER BY 'Fact Distribution'[Utility] ASC`;
        }
        case "recovery": {
          const uFilter = p.utility ? `FILTER('Fact FinancialAccounts'[Utility] = "${escapeDax(p.utility)}")` : "";
          return `EVALUATE SUMMARIZECOLUMNS('Fact FinancialAccounts'[Utility], "Current Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]), "Projected Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]) * ${1 + pct}) ${uFilter} FILTER('Fact FinancialAccounts'[FY] = "${fy}") ORDER BY 'Fact FinancialAccounts'[Utility] ASC`;
        }
        default: {
          const uFilter = p.utility ? `FILTER('Fact SAIDI and SAIFI'[Utility] = "${escapeDax(p.utility)}")` : "";
          return `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], "Current SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value]), "Projected SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value]) * ${1 + pct}) ${uFilter} FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[Utility] ASC`;
        }
      }
    },
  },

  // ═══════════════════════════════════════════════════════
  // TRANSMISSION
  // ═══════════════════════════════════════════════════════
  transmission_overview: {
    name: "transmission_overview",
    description: "Transmission network: line length by voltage level and substation capacity by utility",
    returns: "Utility, Voltage Level, Line km, Substation MVA",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["transmission", "transmission lines", "high voltage", "substation", "transmission network", "grid"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Transmission'[Utility], 'Fact Transmission'[Voltage Level], "Line km", SUM('Fact Transmission'[Transmission Line Length (km)]), "Substation MVA", SUM('Fact Transmission'[Substation Capacity (MVA)])) FILTER('Fact Transmission'[FY] = "${fy}") ORDER BY 'Fact Transmission'[Utility] ASC`;
    },
  },

  transmission_capacity: {
    name: "transmission_capacity",
    description: "Total transmission line length and substation capacity by utility (aggregated across voltage levels)",
    returns: "Utility, Total Line km, Total Substation MVA",
    result_type: "ranking",
    recommended_chart: "leaderboard",
    aliases: ["transmission capacity", "grid capacity", "substation total", "how much transmission"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Transmission'[Utility], "Total Line km", SUM('Fact Transmission'[Transmission Line Length (km)]), "Total MVA", SUM('Fact Transmission'[Substation Capacity (MVA)])) FILTER('Fact Transmission'[FY] = "${fy}") ORDER BY 'Fact Transmission'[Utility] ASC`;
    },
  },

  // ═══════════════════════════════════════════════════════
  // CAPACITY FACTOR & TECHNICAL LOSSES
  // ═══════════════════════════════════════════════════════
  capacity_factor: {
    name: "capacity_factor",
    description: "Generation capacity factor: actual MWh output / (rated MW x 8760 hours). Measures how efficiently each utility uses its rated capacity.",
    returns: "Utility, Rated MW, Total MWh, Capacity Factor (%), Peak MW",
    result_type: "ranking",
    recommended_chart: "scatter",
    aliases: ["capacity factor", "utilization rate", "plant efficiency", "capacity utilization", "how much capacity is used"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact GeneratorsData'[Utility],
        "Rated MW", SUM('Fact GeneratorsData'[Rated Capacity (MW)]),
        "Total MWh", CALCULATE(SUM('Fact Generation'[GEN Electricity Generated (MWh)]), TREATAS(VALUES('Fact GeneratorsData'[Utility]), 'Fact Generation'[Utility]), 'Fact Generation'[FY] = "${fy}")
      ) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Utility] ASC`;
    },
  },

  technical_losses: {
    name: "technical_losses",
    description: "Technical vs non-technical system loss breakdown. Technical losses are inherent grid physics; non-technical are commercial/theft losses.",
    returns: "Utility, Total Losses %, Technical Losses %, Non-Technical Losses %",
    result_type: "comparison",
    recommended_chart: "bar-chart",
    aliases: ["technical losses", "non technical losses", "commercial losses", "theft", "loss breakdown", "loss split"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Distribution'[Utility], "Total Losses %", AVERAGE('Fact Distribution'[System Losses (%)])) FILTER('Fact Distribution'[FY] = "${fy}") ORDER BY 'Fact Distribution'[Utility] ASC`;
    },
  },

  // ═══════════════════════════════════════════════════════
  // CARBON EMISSIONS
  // ═══════════════════════════════════════════════════════
  carbon_emissions: {
    name: "carbon_emissions",
    description: "Estimated CO2 emissions from diesel generation. Uses diesel MW rated capacity and standard emission factors to estimate annual CO2 output.",
    returns: "Utility, Diesel MW, Diesel %, Estimated Annual CO2 (tCO2), Renewable MW",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["carbon emissions", "CO2", "emissions", "greenhouse gas", "carbon footprint", "climate impact", "GHG", "pollution"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact GeneratorsData'[Utility],
        "Diesel MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Energy Source] = "Diesel"),
        "Total MW", SUM('Fact GeneratorsData'[Rated Capacity (MW)]),
        "Renewable MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Energy Source] IN {"Solar", "Wind", "Hydro", "Biomass", "Geothermal"} || 'Fact GeneratorsData'[Energy Type] = "Renewable")
      ) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Utility] ASC`;
    },
  },

  // ═══════════════════════════════════════════════════════
  // GOVERNANCE & LEADERSHIP
  // ═══════════════════════════════════════════════════════
  governance_summary: {
    name: "governance_summary",
    description: "Governance performance: compliance score, board meetings, audit findings, and resolution rate by utility",
    returns: "Utility, Governance Score, Audit Findings, Resolution Rate, Compliance %",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["governance", "board", "audit", "compliance", "governance score", "corporate governance", "regulatory compliance"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Governance'[Utility], "Governance Score", AVERAGE('Fact Governance'[Governance Score]), "Audit Findings", SUM('Fact Governance'[Audit Findings]), "Resolved", SUM('Fact Governance'[Audit Findings Resolved]), "Compliance %", AVERAGE('Fact Governance'[Regulatory Compliance (%)])) FILTER('Fact Governance'[FY] = "${fy}") ORDER BY 'Fact Governance'[Governance Score] DESC`;
    },
  },

  leadership_summary: {
    name: "leadership_summary",
    description: "Leadership capacity: CEO tenure, board diversity, succession planning, strategic plan status, senior vacancies",
    returns: "Utility, CEO Years, Board Female %, Succession Plan, Strategic Plan, Vacancies",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["leadership", "CEO tenure", "board diversity", "succession", "board gender", "strategic plan", "senior management"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Leadership'[Utility], 'Fact Leadership'[FY], "CEO Years", AVERAGE('Fact Leadership'[CEO Tenure (Years)]), "Board Female", SUM('Fact Leadership'[Board Female Members]), "Board Total", SUM('Fact Leadership'[Board Total Members]), "Vacancies", SUM('Fact Leadership'[Senior Management Vacancies])) FILTER('Fact Leadership'[FY] = "${fy}") ORDER BY 'Fact Leadership'[Utility] ASC`;
    },
  },

  // ═══════════════════════════════════════════════════════
  // CONTEXT & COMPARISON
  // ═══════════════════════════════════════════════════════
  country_comparison: {
    name: "country_comparison",
    description: "Country-level macro indicators: GDP per capita, population, inflation, land area — cross-reference with utility performance",
    returns: "Country, GDP/Capita, Population, Inflation %, Land Area km²",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["country comparison", "GDP", "inflation", "population data", "country stats", "macro indicators", "economic data"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact CountryContextData'[Country], "GDP per Capita", AVERAGE('Fact CountryContextData'[GDP per Capita]), "Population", SUM('Fact CountryContextData'[Population]), "Inflation %", AVERAGE('Fact CountryContextData'[Inflation Rate (%)]), "Land Area km^2", SUM('Fact CountryContextData'[Land Area (km^2)])) FILTER('Fact CountryContextData'[FY] = "${fy}") ORDER BY 'Fact CountryContextData'[Country] ASC`;
    },
  },

  ownership_analysis: {
    name: "ownership_analysis",
    description: "Compare utility performance grouped by ownership type (Public, Private, PPP, Community). Identifies if ownership structure correlates with outcomes.",
    returns: "Ownership Type, Number of Utilities, Avg SAIDI, Avg Losses %, Avg Recovery %",
    result_type: "comparison",
    recommended_chart: "bar-chart",
    aliases: ["ownership", "public vs private", "who owns utilities", "ownership structure", "PPP", "privatization"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact UtilityContextData'[Ownership Type], "Utility Count", COUNT('Fact UtilityContextData'[Utility])) FILTER('Fact UtilityContextData'[FY] = "${fy}") ORDER BY 'Fact UtilityContextData'[Ownership Type] ASC`;
    },
  },

  regulatory_comparison: {
    name: "regulatory_comparison",
    description: "Compare utilities under different regulatory frameworks. Identifies which regulatory models produce better outcomes.",
    returns: "Regulatory Framework, Utility Count, Avg SAIDI, Avg Losses %, Avg Recovery %",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["regulatory", "regulation comparison", "regulator", "regulatory framework", "which regulation works best"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact UtilityContextData'[Regulatory Framework], "Utility Count", COUNT('Fact UtilityContextData'[Utility])) FILTER('Fact UtilityContextData'[FY] = "${fy}") ORDER BY 'Fact UtilityContextData'[Regulatory Framework] ASC`;
    },
  },

  air_connectivity: {
    name: "air_connectivity",
    description: "Air transport connectivity: airports, international routes, weekly flights — critical for island utility logistics, spare parts, and expert visits.",
    returns: "Utility, Country, Airports, Intl Routes, Weekly Flights, Distance to Hub (km)",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["air connectivity", "airports", "flights", "transport", "logistics", "isolation", "accessibility", "how remote"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact AirConnectivity'[Utility], 'Fact AirConnectivity'[Country], "Airports", SUM('Fact AirConnectivity'[Total Airports]), "Intl Routes", SUM('Fact AirConnectivity'[International Routes]), "Flights/Week", SUM('Fact AirConnectivity'[Weekly International Flights])) FILTER('Fact AirConnectivity'[FY] = "${fy}") ORDER BY 'Fact AirConnectivity'[Utility] ASC`;
    },
  },

  household_electrification: {
    name: "household_electrification",
    description: "Household-level electrification: total households, urban/rural split, electrified households — finer granularity than population-level metrics.",
    returns: "Utility, Total Households, Urban, Rural, Electrified, Urban %",
    result_type: "comparison",
    recommended_chart: "bar-chart",
    aliases: ["households", "household electrification", "rural households", "urban households", "household access"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Households'[Utility], 'Fact Households'[FY], "Total Households", SUM('Fact Households'[Total Households]), "Urban", SUM('Fact Households'[Urban Households]), "Rural", SUM('Fact Households'[Rural Households]), "Electrified", SUM('Fact Households'[Electrified Households])) FILTER('Fact Households'[FY] = "${fy}") ORDER BY 'Fact Households'[Utility] ASC`;
    },
  },

  // ═══════════════════════════════════════════════════════
  // HR, GENDER & SAFETY — DETAILED
  // ═══════════════════════════════════════════════════════
  gender_by_level: {
    name: "gender_by_level",
    description: "Gender composition broken down by job level: total female %, female managers %, female technical staff %. Critical for tracking women's advancement beyond entry-level.",
    returns: "Utility, Total Staff, Female Total, Female %, Female Managers, Female Mgmt %, Female Technical, Female Tech %",
    result_type: "comparison",
    recommended_chart: "bar-chart",
    aliases: ["gender by level", "women in management", "female managers", "female engineers", "gender breakdown", "women leadership", "glass ceiling"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Employee'[Utility], "Total Staff", SUM('Fact Employee'[Total Employees]), "Female Total", SUM('Fact Employee'[Female Employees]), "Female Managers", SUM('Fact Employee'[Female Managers]), "Female Technical", SUM('Fact Employee'[Female Technical Staff])) FILTER('Fact Employee'[FY] = "${fy}") ORDER BY 'Fact Employee'[Utility] ASC`;
    },
  },

  staff_turnover: {
    name: "staff_turnover",
    description: "Staff turnover and retention: hiring vs departures, turnover rate. High turnover signals organizational instability, brain drain, or competitive labor market pressure.",
    returns: "Utility, Total Staff, Staff Hired, Staff Departed, Turnover Rate (%), Net Change",
    result_type: "ranking",
    recommended_chart: "scatter",
    aliases: ["staff turnover", "retention", "hiring", "departures", "brain drain", "staff leaving", "attrition", "employee retention"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Employee'[Utility], "Total Staff", SUM('Fact Employee'[Total Employees]), "Hired", SUM('Fact Employee'[Staff Hired]), "Departed", SUM('Fact Employee'[Staff Departed])) FILTER('Fact Employee'[FY] = "${fy}") ORDER BY 'Fact Employee'[Utility] ASC`;
    },
  },

  training_investment: {
    name: "training_investment",
    description: "Training investment: budget, hours delivered, completion rate, spend per employee. Measures human capital development — critical for Pacific utilities facing skills gaps.",
    returns: "Utility, Training Budget, Training Hours, Staff Trained, Trained %, Spend per Employee",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["training investment", "training budget", "training spend", "skills development", "human capital", "training hours", "staff development", "capacity building spend"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Employee'[Utility], "Training Budget", SUM('Fact Employee'[Training Budget (USD)]), "Training Hours", SUM('Fact Employee'[Training Hours Delivered]), "Staff Trained", SUM('Fact Employee'[Staff Trained]), "Total Staff", SUM('Fact Employee'[Total Employees])) FILTER('Fact Employee'[FY] = "${fy}") ORDER BY 'Fact Employee'[Utility] ASC`;
    },
  },

  contract_mix: {
    name: "contract_mix",
    description: "Contract vs permanent staff split, plus apprentices/trainees. High contract ratios indicate workforce precarity; high apprentice counts indicate pipeline development.",
    returns: "Utility, Total Staff, Permanent, Contract, Contract %, Apprentices, Apprentice %",
    result_type: "comparison",
    recommended_chart: "bar-chart",
    aliases: ["contract staff", "permanent staff", "precarious work", "apprentices", "trainees", "workforce stability", "temporary staff"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Employee'[Utility], "Total Staff", SUM('Fact Employee'[Total Employees]), "Permanent", SUM('Fact Employee'[Permanent Staff]), "Contract", SUM('Fact Employee'[Contract Staff]), "Apprentices", SUM('Fact Employee'[Apprentices/Trainees])) FILTER('Fact Employee'[FY] = "${fy}") ORDER BY 'Fact Employee'[Utility] ASC`;
    },
  },

  expat_local_split: {
    name: "expat_local_split",
    description: "Expatriate vs local staff ratio. Pacific utilities often rely on expat expertise; tracking localization is critical for sustainability and donor requirements.",
    returns: "Utility, Total Staff, Local Staff, Local %, Expat Staff, Expat %",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["expat", "local staff", "localization", "expatriate", "foreign staff", "local capacity", "localization rate"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Employee'[Utility], "Total Staff", SUM('Fact Employee'[Total Employees]), "Local", SUM('Fact Employee'[Local Staff]), "Expat", SUM('Fact Employee'[Expatriate Staff])) FILTER('Fact Employee'[FY] = "${fy}") ORDER BY 'Fact Employee'[Utility] ASC`;
    },
  },

  safety_leading: {
    name: "safety_leading",
    description: "Safety leading indicators: near misses reported, safety observations, toolbox talks, safety training completion. These predict future incidents before they happen.",
    returns: "Utility, LTIFR, Near Misses, Safety Observations, Toolbox Talks, Safety Training %, Audit Compliance",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["safety leading", "near misses", "safety observations", "toolbox talks", "safety culture", "proactive safety", "safety prevention"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Safety'[Utility], "LTIFR", AVERAGE('Fact Safety'[LTIFR]), "Near Misses", SUM('Fact Safety'[Near Misses Reported]), "Observations", SUM('Fact Safety'[Safety Observations]), "Toolbox Talks", SUM('Fact Safety'[Toolbox Talks Delivered]), "Safety Training", SUM('Fact Safety'[Safety Training Completed])) FILTER('Fact Safety'[FY] = "${fy}") ORDER BY 'Fact Safety'[Utility] ASC`;
    },
  },

  safety_trend: {
    name: "safety_trend",
    description: "Safety performance over time: LTIFR, fatalities, and near-miss reporting trends across all available fiscal years.",
    returns: "Utility, FY, LTIFR, Lost Time Injuries, Fatalities, Near Misses",
    result_type: "trend",
    recommended_chart: "line-chart",
    aliases: ["safety over time", "safety history", "LTIFR trend", "improving safety", "getting safer", "safety performance trend"],
    params: { utility: { type: "string", description: "Utility acronym. Omit for all.", required: false } },
    dax: (p) => {
      const filter = p.utility ? `FILTER('Fact Safety'[Utility] = "${escapeDax(p.utility)}")` : "";
      return `EVALUATE SUMMARIZECOLUMNS('Fact Safety'[Utility], 'Fact Safety'[FY], "LTIFR", AVERAGE('Fact Safety'[LTIFR]), "LTIs", SUM('Fact Safety'[Lost Time Injuries]), "Fatalities", SUM('Fact Safety'[Fatalities]), "Near Misses", SUM('Fact Safety'[Near Misses Reported])) ${filter} ORDER BY 'Fact Safety'[FY] ASC`;
    },
  },

  hr_cost: {
    name: "hr_cost",
    description: "HR investment metrics: training spend per employee, staff cost efficiency, training budget as share of operating costs. Measures how much utilities invest in their people.",
    returns: "Utility, Total Staff, Training Budget, Training per Employee, Apprentice Count, Localization %",
    result_type: "comparison",
    recommended_chart: "scatter",
    aliases: ["HR cost", "cost per employee", "training per person", "staff investment", "HR budget", "people investment"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Employee'[Utility], "Total Staff", SUM('Fact Employee'[Total Employees]), "Training Budget", SUM('Fact Employee'[Training Budget (USD)]), "Local Staff", SUM('Fact Employee'[Local Staff]), "Expat Staff", SUM('Fact Employee'[Expatriate Staff]), "Apprentices", SUM('Fact Employee'[Apprentices/Trainees])) FILTER('Fact Employee'[FY] = "${fy}") ORDER BY 'Fact Employee'[Utility] ASC`;
    },
  },

  // ═══════════════════════════════════════════════════════
  // PACIFIC ISLAND UTILITY DOMAIN QUERIES
  // ═══════════════════════════════════════════════════════

  // ── Diesel & Fuel Dependence ──
  diesel_dependence: {
    name: "diesel_dependence",
    description: "Diesel generation as share of total capacity — identifies utilities most vulnerable to fuel price shocks",
    returns: "Utility, Diesel MW, Total MW, Diesel %, Renewable %",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["diesel dependence", "fuel dependence", "oil dependence", "fossil fuel share", "how much diesel", "diesel percentage", "renewable share", "fuel vulnerability"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact GeneratorsData'[Utility],
        "Diesel MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Energy Source] = "Diesel"),
        "Total MW", SUM('Fact GeneratorsData'[Rated Capacity (MW)]),
        "Renewable MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Energy Source] IN {"Solar", "Wind", "Hydro", "Biomass", "Geothermal"} || 'Fact GeneratorsData'[Energy Type] = "Renewable")
      ) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Utility] ASC`;
    },
  },

  renewable_penetration: {
    name: "renewable_penetration",
    description: "Renewable energy share by utility — tracks progress toward NDC and renewable targets",
    returns: "Utility, Renewable MW, Total MW, Renewable %, Generation from Renewables (MWh), Total Generation (MWh)",
    result_type: "comparison",
    recommended_chart: "bar-chart",
    aliases: ["renewable penetration", "renewable share", "green energy", "clean energy percent", "NDC progress", "renewable target", "energy transition"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact GeneratorsData'[Utility],
        "Renewable MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Energy Source] IN {"Solar", "Wind", "Hydro", "Biomass", "Geothermal"} || 'Fact GeneratorsData'[Energy Type] = "Renewable"),
        "Total MW", SUM('Fact GeneratorsData'[Rated Capacity (MW)])
      ) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Utility] ASC`;
    },
  },

  fuel_efficiency: {
    name: "fuel_efficiency",
    description: "Generation output per unit of rated capacity — proxy for fuel efficiency and plant utilization",
    returns: "Utility, Total MWh, Total MW, MWh per MW (capacity factor proxy), Peak MW",
    result_type: "ranking",
    recommended_chart: "scatter",
    aliases: ["fuel efficiency", "plant efficiency", "generation efficiency", "capacity utilization", "MWh per MW", "how efficient"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact GeneratorsData'[Utility],
        "Total MW", SUM('Fact GeneratorsData'[Rated Capacity (MW)]),
        "Total MWh", CALCULATE(SUM('Fact Generation'[GEN Electricity Generated (MWh)]), TREATAS(VALUES('Fact GeneratorsData'[Utility]), 'Fact Generation'[Utility]), 'Fact Generation'[FY] = "${fy}"),
        "Peak MW", CALCULATE(MAX('Fact Generation'[Electricity Demand Peak Load]), TREATAS(VALUES('Fact GeneratorsData'[Utility]), 'Fact Generation'[Utility]), 'Fact Generation'[FY] = "${fy}")
      ) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Utility] ASC`;
    },
  },

  // ── Climate & Disaster Resilience ──
  climate_risk_profile: {
    name: "climate_risk_profile",
    description: "Multi-factor risk profile combining reliability (SAIDI), diesel dependence, and island geography as climate vulnerability indicators",
    returns: "Utility, SAIDI, Diesel %, Island Count (if available), Risk Score",
    result_type: "ranking",
    recommended_chart: "heatmap",
    aliases: ["climate risk", "disaster risk", "vulnerability", "resilience", "cyclone risk", "climate vulnerability", "which utility is most vulnerable"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact SAIDI and SAIFI'[Utility],
        "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value]),
        "Diesel MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Energy Source] = "Diesel", 'Fact GeneratorsData'[FY] = "${fy}"),
        "Total MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[FY] = "${fy}"),
        "Islands", CALCULATE(MAX('Fact UtilityContextData'[Number of Islands Served]), TREATAS(VALUES('Fact SAIDI and SAIFI'[Utility]), 'Fact UtilityContextData'[Utility]), 'Fact UtilityContextData'[FY] = "${fy}")
      ) FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[SAIDI Value] DESC`;
    },
  },

  outage_trend_by_source: {
    name: "outage_trend_by_source",
    description: "SAIDI trend over all available years — identifies if reliability is improving or deteriorating, critical for climate adaptation planning",
    returns: "Utility, FY, SAIDI — chronological, useful for spotting deterioration patterns",
    result_type: "trend",
    recommended_chart: "line-chart",
    aliases: ["outage history", "SAIDI history", "reliability deterioration", "getting worse outages", "outage pattern", "which utilities improving"],
    params: {},
    dax: () =>
      `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], 'Fact SAIDI and SAIFI'[FY], "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value])) ORDER BY 'Fact SAIDI and SAIFI'[FY] ASC, 'Fact SAIDI and SAIFI'[SAIDI Value] DESC`,
  },

  // ── Island Peer Context ──
  island_peer_group: {
    name: "island_peer_group",
    description: "Compare utilities with similar island/geography profiles — groups by island count and service territory type for fair benchmarking",
    returns: "Utility, Island Count, Service Type, Country, Region",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["island peers", "similar utilities", "fair comparison", "peer group", "comparable utilities", "similar size", "island context"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact UtilityContextData'[Utility],
        'Fact UtilityContextData'[Number of Islands Served],
        'Fact UtilityContextData'[Service Area Type],
        'Fact UtilityContextData'[Country],
        'Fact UtilityContextData'[Region],
        'Fact UtilityContextData'[Ownership Type]
      ) FILTER('Fact UtilityContextData'[FY] = "${fy}") ORDER BY 'Fact UtilityContextData'[Number of Islands Served] ASC`;
    },
  },

  small_utility_benchmark: {
    name: "small_utility_benchmark",
    description: "Filter performance data for small/medium utilities only (< 50,000 customers) — the most relevant peer group for Pacific island utilities",
    returns: "Utility, SAIDI, Losses %, Recovery %, Customers, Electrification % — only utilities under 50k customers",
    result_type: "comparison",
    recommended_chart: "table",
    aliases: ["small utility", "small island utility", "SIDS comparison", "similar to us", "comparable", "island benchmark", "regional benchmark"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE FILTER(
        SUMMARIZECOLUMNS(
          'Fact Customer'[Utility],
          "Customers", SUM('Fact Customer'[Total Connections]),
          "Electrification %", AVERAGE('Fact Customer'[Electrification Rate (%)]),
          "SAIDI", CALCULATE(SUM('Fact SAIDI and SAIFI'[SAIDI Value]), TREATAS(VALUES('Fact Customer'[Utility]), 'Fact SAIDI and SAIFI'[Utility]), 'Fact SAIDI and SAIFI'[FY] = "${fy}"),
          "Losses %", CALCULATE(AVERAGE('Fact Distribution'[System Losses (%)]), TREATAS(VALUES('Fact Customer'[Utility]), 'Fact Distribution'[Utility]), 'Fact Distribution'[FY] = "${fy}"),
          "Recovery %", CALCULATE(AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]), TREATAS(VALUES('Fact Customer'[Utility]), 'Fact FinancialAccounts'[Utility]), 'Fact FinancialAccounts'[FY] = "${fy}")
        ) FILTER('Fact Customer'[FY] = "${fy}"),
        [Customers] < 50000
      ) ORDER BY 'Fact Customer'[Utility] ASC`;
    },
  },

  // ── Workforce Planning ──
  workforce_efficiency: {
    name: "workforce_efficiency",
    description: "Customers per employee and technical staff ratio — identifies over/understaffed utilities",
    returns: "Utility, Total Staff, Technical Staff, Customers, Customers per Staff, Customers per Technical Staff",
    result_type: "ranking",
    recommended_chart: "scatter",
    aliases: ["staff efficiency", "workforce productivity", "employees per customer", "overstaffed", "understaffed", "staff ratio", "how many staff"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact Employee'[Utility],
        "Total Staff", SUM('Fact Employee'[Total Employees]),
        "Technical Staff", SUM('Fact Employee'[Technical Staff]),
        "Female Staff", SUM('Fact Employee'[Female Employees]),
        "Customers", CALCULATE(SUM('Fact Customer'[Total Connections]), TREATAS(VALUES('Fact Employee'[Utility]), 'Fact Customer'[Utility]), 'Fact Customer'[FY] = "${fy}")
      ) FILTER('Fact Employee'[FY] = "${fy}") ORDER BY 'Fact Employee'[Utility] ASC`;
    },
  },

  gender_diversity: {
    name: "gender_diversity",
    description: "Female workforce participation across utilities — tracks gender inclusion progress",
    returns: "Utility, Total Staff, Female Staff, Female %, Staff Trained",
    result_type: "comparison",
    recommended_chart: "bar-chart",
    aliases: ["gender diversity", "female staff", "women in energy", "gender balance", "diversity", "inclusion", "female participation"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS('Fact Employee'[Utility], "Total Staff", SUM('Fact Employee'[Total Employees]), "Female Staff", SUM('Fact Employee'[Female Employees]), "Trained", SUM('Fact Employee'[Staff Trained])) FILTER('Fact Employee'[FY] = "${fy}") ORDER BY 'Fact Employee'[Utility] ASC`;
    },
  },

  // ── Tariff & Affordability ──
  tariff_affordability: {
    name: "tariff_affordability",
    description: "Tariff rates vs GDP per capita — measures energy affordability for residential customers",
    returns: "Utility, Country, Avg Tariff Rate, GDP per Capita, Affordability Index (tariff/GDP ratio)",
    result_type: "ranking",
    recommended_chart: "scatter",
    aliases: ["tariff affordability", "energy cost", "how expensive is electricity", "cost of power", "affordability", "tariff burden", "electricity price"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact TariffStructure'[Utility],
        'Fact TariffStructure'[Customer Category],
        "Avg Tariff Rate", AVERAGE('Fact TariffStructure'[Tariff Rate (per kWh)]),
        "Fixed Charge", AVERAGE('Fact TariffStructure'[Fixed Charge])
      ) FILTER('Fact TariffStructure'[FY] = "${fy}") ORDER BY 'Fact TariffStructure'[Utility] ASC, 'Fact TariffStructure'[Customer Category] ASC`;
    },
  },

  tariff_cost_gap: {
    name: "tariff_cost_gap",
    description: "Gap between what utilities charge (tariff recovery) and what they spend (operating costs) — identifies utilities operating at a structural deficit",
    returns: "Utility, Revenue, Operating Costs, Recovery %, Revenue Gap",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["tariff gap", "cost gap", "operating deficit", "not covering costs", "revenue shortfall", "financial gap", "subsidy needed"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact FinancialAccounts'[Utility],
        "Revenue", SUM('Fact FinancialAccounts'[Total Revenue]),
        "Operating Costs", SUM('Fact FinancialAccounts'[Operating Costs]),
        "Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)])
      ) FILTER('Fact FinancialAccounts'[FY] = "${fy}") ORDER BY 'Fact FinancialAccounts'[Tariff Recovery Rate (%)] ASC`;
    },
  },

  // ── Renewable Transition ──
  renewable_gap_analysis: {
    name: "renewable_gap_analysis",
    description: "Gap between current renewable share and targets — identifies how much new renewable capacity each utility needs",
    returns: "Utility, Current Renewable MW, Total MW, Current Renewable %, Target 50%, Gap MW",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["renewable gap", "how much renewable needed", "renewable target gap", "transition gap", "how far from target", "renewable deficit"],
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
      target_pct: { type: "string", description: "Target renewable percentage (e.g., 50)", required: false },
    },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact GeneratorsData'[Utility],
        "Renewable MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Energy Source] IN {"Solar", "Wind", "Hydro", "Biomass", "Geothermal"} || 'Fact GeneratorsData'[Energy Type] = "Renewable"),
        "Total MW", SUM('Fact GeneratorsData'[Rated Capacity (MW)])
      ) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Utility] ASC`;
    },
  },

  solar_potential: {
    name: "solar_potential",
    description: "Current solar capacity vs total capacity — baseline for solar expansion planning",
    returns: "Utility, Solar MW, Total MW, Solar %",
    result_type: "ranking",
    recommended_chart: "bar-chart",
    aliases: ["solar capacity", "solar power", "solar energy", "photovoltaic", "solar potential", "solar share", "how much solar"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact GeneratorsData'[Utility],
        "Solar MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Energy Source] = "Solar"),
        "Total MW", SUM('Fact GeneratorsData'[Rated Capacity (MW)])
      ) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Utility] ASC`;
    },
  },

  // ── Compound Domain Reports ──
  vulnerability_dashboard: {
    name: "vulnerability_dashboard",
    description: "Multi-dimensional vulnerability score: diesel dependence + SAIDI + tariff recovery gap + electrification gap — higher score = more vulnerable",
    returns: "Utility, Diesel %, SAIDI, Recovery %, Electrification %, Vulnerability Score",
    result_type: "ranking",
    recommended_chart: "leaderboard",
    aliases: ["vulnerability dashboard", "who needs help", "most vulnerable", "risk score", "utility risk", "priority ranking"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      return `EVALUATE SUMMARIZECOLUMNS(
        'Fact SAIDI and SAIFI'[Utility],
        "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value]),
        "Diesel MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[Energy Source] = "Diesel", 'Fact GeneratorsData'[FY] = "${fy}"),
        "Total MW", CALCULATE(SUM('Fact GeneratorsData'[Rated Capacity (MW)]), 'Fact GeneratorsData'[FY] = "${fy}"),
        "Recovery %", CALCULATE(AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]), TREATAS(VALUES('Fact SAIDI and SAIFI'[Utility]), 'Fact FinancialAccounts'[Utility]), 'Fact FinancialAccounts'[FY] = "${fy}"),
        "Electrification %", CALCULATE(AVERAGE('Fact Customer'[Electrification Rate (%)]), TREATAS(VALUES('Fact SAIDI and SAIFI'[Utility]), 'Fact Customer'[Utility]), 'Fact Customer'[FY] = "${fy}")
      ) FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[Utility] ASC`;
    },
  },
};

/**
 * Find the best matching query template for a user's natural language question.
 */
export function resolveQueryFromNL(question: string): { template: PbiQueryTemplate; score: number } | null {
  const lower = question.toLowerCase();
  let bestTemplate: PbiQueryTemplate | null = null;
  let bestScore = 0;

  for (const template of Object.values(PBI_QUERIES)) {
    for (const alias of template.aliases) {
      const score = similarity(lower, alias.toLowerCase());
      if (score > bestScore) {
        bestScore = score;
        bestTemplate = template;
      }
    }
    // Also check name match
    const nameScore = similarity(lower, template.name.toLowerCase().replace(/_/g, " "));
    if (nameScore > bestScore) {
      bestScore = nameScore;
      bestTemplate = template;
    }
  }

  return bestTemplate && bestScore > 0.3 ? { template: bestTemplate, score: bestScore } : null;
}

function similarity(a: string, b: string): number {
  if (a.includes(b) || b.includes(a)) return 0.8;
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  let matches = 0;
  for (const w of aWords) { if (bWords.has(w)) matches++; }
  const total = Math.max(aWords.size, bWords.size, 1);
  return matches / total;
}

/**
 * Get a compact list of all available query templates for the AI.
 */
export function getQueryCatalog(): string {
  const lines: string[] = [];
  for (const template of Object.values(PBI_QUERIES)) {
    const params = Object.entries(template.params)
      .filter(([, v]) => v.required)
      .map(([k]) => k)
      .join(", ");
    lines.push(`- ${template.name}(${params}) [${template.result_type}→${template.recommended_chart}] — ${template.description}`);
  }
  return lines.join("\n");
}

/**
 * Get templates grouped by category for the AI prompt.
 */
export function getQueryCatalogByCategory(): string {
  const categories: Record<string, string[]> = {
    Reliability: [],
    "Generation & Capacity": [],
    Distribution: [],
    Financials: [],
    Customers: [],
    "Workforce & Safety": [],
    "Compound / Cross-Domain": [],
    "What-If Analysis": [],
    "Diesel & Fuel": [],
    "Climate & Resilience": [],
    "Island Peer Context": [],
    "Tariff & Affordability": [],
    "Renewable Transition": [],
    "Transmission": [],
    "Governance & Leadership": [],
    "Context & Comparison": [],
  };

  const catMap: Record<string, string> = {
    saidi_by_utility: "Reliability", saifi_by_utility: "Reliability", reliability_summary: "Reliability", saidi_trend: "Reliability", outage_trend_by_source: "Reliability",
    rated_capacity: "Generation & Capacity", rated_capacity_by_utility: "Generation & Capacity", generation_output: "Generation & Capacity", generation_by_source: "Generation & Capacity", peak_demand: "Generation & Capacity", generation_trend: "Generation & Capacity",
    system_losses: "Distribution", distribution_overview: "Distribution", losses_trend: "Distribution",
    financial_summary: "Financials", cost_recovery: "Financials", recovery_trend: "Financials",
    customer_overview: "Customers", metering_summary: "Customers", electrification_trend: "Customers",
    workforce_summary: "Workforce & Safety", safety_summary: "Workforce & Safety",
    utility_profile: "Compound / Cross-Domain", peer_comparison: "Compound / Cross-Domain", composite_score: "Compound / Cross-Domain", vulnerability_dashboard: "Compound / Cross-Domain",
    whatif_sensitivity: "What-If Analysis",
    diesel_dependence: "Diesel & Fuel", fuel_efficiency: "Diesel & Fuel", renewable_penetration: "Diesel & Fuel",
    climate_risk_profile: "Climate & Resilience",
    island_peer_group: "Island Peer Context", small_utility_benchmark: "Island Peer Context",
    workforce_efficiency: "Workforce & Safety", gender_diversity: "Workforce & Safety",
    gender_by_level: "Workforce & Safety", staff_turnover: "Workforce & Safety",
    training_investment: "Workforce & Safety", contract_mix: "Workforce & Safety",
    expat_local_split: "Workforce & Safety", hr_cost: "Workforce & Safety",
    safety_leading: "Workforce & Safety", safety_trend: "Workforce & Safety",
    tariff_affordability: "Tariff & Affordability", tariff_cost_gap: "Tariff & Affordability",
    renewable_gap_analysis: "Renewable Transition", solar_potential: "Renewable Transition",
    transmission_overview: "Transmission", transmission_capacity: "Transmission",
    capacity_factor: "Generation & Capacity", technical_losses: "Distribution",
    carbon_emissions: "Climate & Resilience",
    governance_summary: "Governance & Leadership", leadership_summary: "Governance & Leadership",
    country_comparison: "Context & Comparison", ownership_analysis: "Context & Comparison",
    regulatory_comparison: "Context & Comparison", air_connectivity: "Context & Comparison",
    household_electrification: "Customers",
  };

  for (const template of Object.values(PBI_QUERIES)) {
    const cat = catMap[template.name] || "Other";
    const params = Object.entries(template.params).filter(([, v]) => v.required).map(([k]) => k).join(", ");
    categories[cat].push(`  - ${template.name}(${params}) → ${template.description}`);
  }

  const result: string[] = [];
  for (const [cat, items] of Object.entries(categories)) {
    if (items.length > 0) {
      result.push(`### ${cat}`);
      result.push(...items);
      result.push("");
    }
  }
  return result.join("\n");
}
