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
  installed_capacity: {
    name: "installed_capacity",
    description: "Total installed capacity (MW) by utility and energy source",
    returns: "Utility, Energy Source, Total MW installed",
    result_type: "breakdown",
    recommended_chart: "bar-chart",
    aliases: ["capacity by source", "installed capacity breakdown", "MW by fuel", "generation capacity", "power plant capacity"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact GeneratorsData'[Utility], 'Fact GeneratorsData'[Energy Source], "Installed MW", SUM('Fact GeneratorsData'[Installed Capacity (MW)])) FILTER('Fact GeneratorsData'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact GeneratorsData'[Utility] ASC, 'Fact GeneratorsData'[Energy Source] ASC`,
  },

  installed_capacity_by_utility: {
    name: "installed_capacity_by_utility",
    description: "Total installed capacity per utility (aggregated across all sources)",
    returns: "Utility, Total MW",
    result_type: "ranking",
    recommended_chart: "leaderboard",
    aliases: ["total capacity", "capacity ranking", "who has most capacity", "largest utility", "MW ranking"],
    params: { fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true } },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS('Fact GeneratorsData'[Utility], "Total MW", SUM('Fact GeneratorsData'[Installed Capacity (MW)])) FILTER('Fact GeneratorsData'[FY] = "${escapeDax(p.fy)}") ORDER BY 'Fact GeneratorsData'[Utility] ASC`,
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
      return `EVALUATE VAR _Capacity = CALCULATE(SUM('Fact GeneratorsData'[Installed Capacity (MW)]), 'Fact GeneratorsData'[Utility] = "${u}", 'Fact GeneratorsData'[FY] = "${fy}") VAR _Generation = CALCULATE(SUM('Fact Generation'[GEN Electricity Generated (MWh)]), 'Fact Generation'[Utility] = "${u}", 'Fact Generation'[FY] = "${fy}") VAR _PeakLoad = CALCULATE(MAX('Fact Generation'[Electricity Demand Peak Load]), 'Fact Generation'[Utility] = "${u}", 'Fact Generation'[FY] = "${fy}") VAR _Losses = CALCULATE(AVERAGE('Fact Distribution'[System Losses (%)]), 'Fact Distribution'[Utility] = "${u}", 'Fact Distribution'[FY] = "${fy}") VAR _Revenue = CALCULATE(SUM('Fact FinancialAccounts'[Total Revenue]), 'Fact FinancialAccounts'[Utility] = "${u}", 'Fact FinancialAccounts'[FY] = "${fy}") VAR _Recovery = CALCULATE(AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]), 'Fact FinancialAccounts'[Utility] = "${u}", 'Fact FinancialAccounts'[FY] = "${fy}") VAR _Connections = CALCULATE(SUM('Fact Customer'[Total Connections]), 'Fact Customer'[Utility] = "${u}", 'Fact Customer'[FY] = "${fy}") VAR _Electrification = CALCULATE(AVERAGE('Fact Customer'[Electrification Rate (%)]), 'Fact Customer'[Utility] = "${u}", 'Fact Customer'[FY] = "${fy}") RETURN ROW("Utility", "${u}", "FY", "${fy}", "Installed Capacity MW", _Capacity, "Generation MWh", _Generation, "Peak Demand MW", _PeakLoad, "System Losses %", _Losses, "Revenue", _Revenue, "Cost Recovery %", _Recovery, "Customers", _Connections, "Electrification %", _Electrification)`;
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
        case "capacity": return `EVALUATE SUMMARIZECOLUMNS('Fact GeneratorsData'[Utility], "Value", SUM('Fact GeneratorsData'[Installed Capacity (MW)])) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Installed Capacity (MW)] DESC`;
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
  };

  const catMap: Record<string, string> = {
    saidi_by_utility: "Reliability", saifi_by_utility: "Reliability", reliability_summary: "Reliability", saidi_trend: "Reliability",
    installed_capacity: "Generation & Capacity", installed_capacity_by_utility: "Generation & Capacity", generation_output: "Generation & Capacity", generation_by_source: "Generation & Capacity", peak_demand: "Generation & Capacity", generation_trend: "Generation & Capacity",
    system_losses: "Distribution", distribution_overview: "Distribution", losses_trend: "Distribution",
    financial_summary: "Financials", cost_recovery: "Financials", recovery_trend: "Financials",
    customer_overview: "Customers", metering_summary: "Customers", electrification_trend: "Customers",
    workforce_summary: "Workforce & Safety", safety_summary: "Workforce & Safety",
    utility_profile: "Compound / Cross-Domain", peer_comparison: "Compound / Cross-Domain", composite_score: "Compound / Cross-Domain",
    whatif_sensitivity: "What-If Analysis",
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
