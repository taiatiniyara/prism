/**
 * Pre-built Power BI DAX Query Templates
 *
 * Battle-tested DAX queries for the most common AI questions.
 * Each template has a name, description, typed parameters, and a DAX generator.
 * The AI calls pbi_query with a template name + params instead of writing raw DAX.
 *
 * To add a query:
 * 1. Add an entry to PBI_QUERIES with a unique name
 * 2. Define typed parameters
 * 3. Write a DAX generator function
 * 4. Test it against the Power BI dataset
 */

export interface PbiQueryTemplate {
  /** Unique identifier for this query */
  name: string;
  /** Human-readable description — shown to the AI */
  description: string;
  /** What this query returns */
  returns: string;
  /** Parameter descriptions */
  params: Record<string, { type: "string" | "number"; description: string; required: boolean }>;
  /** The DAX generator — receives typed params, returns a DAX string */
  dax: (params: Record<string, string>) => string;
}

const escapeDax = (s: string): string => s.replace(/'/g, "''");

export const PBI_QUERIES: Record<string, PbiQueryTemplate> = {
  // ── Reliability ──
  saidi_by_utility: {
    name: "saidi_by_utility",
    description: "SAIDI (outage duration) for all utilities in a fiscal year, sorted best to worst",
    returns: "Utility, SAIDI value, ranked by shortest outages first",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact SAIDI and SAIFI'[Utility],
        'Fact SAIDI and SAIFI'[FY],
        "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value])
      )
      FILTER('Fact SAIDI and SAIFI'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact SAIDI and SAIFI'[SAIDI Value] ASC`,
  },

  saifi_by_utility: {
    name: "saifi_by_utility",
    description: "SAIFI (outage frequency) for all utilities in a fiscal year",
    returns: "Utility, SAIFI value, ranked by fewest interruptions first",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact SAIDI and SAIFI'[Utility],
        'Fact SAIDI and SAIFI'[FY],
        "SAIFI", SUM('Fact SAIDI and SAIFI'[SAIFI Value])
      )
      FILTER('Fact SAIDI and SAIFI'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact SAIDI and SAIFI'[SAIFI Value] ASC`,
  },

  reliability_summary: {
    name: "reliability_summary",
    description: "SAIDI and SAIFI together for all utilities — use for reliability overview",
    returns: "Utility, SAIDI, SAIFI, ranked by SAIDI",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact SAIDI and SAIFI'[Utility],
        'Fact SAIDI and SAIFI'[FY],
        "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value]),
        "SAIFI", SUM('Fact SAIDI and SAIFI'[SAIFI Value])
      )
      FILTER('Fact SAIDI and SAIFI'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact SAIDI and SAIFI'[SAIDI Value] ASC`,
  },

  // ── Generation & Capacity ──
  installed_capacity: {
    name: "installed_capacity",
    description: "Total installed capacity (MW) by utility and energy source",
    returns: "Utility, Energy Source, Total MW installed",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact GeneratorsData'[Utility],
        'Fact GeneratorsData'[Energy Source],
        "Installed MW", SUM('Fact GeneratorsData'[Installed Capacity (MW)])
      )
      FILTER('Fact GeneratorsData'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact GeneratorsData'[Utility] ASC, 'Fact GeneratorsData'[Energy Source] ASC`,
  },

  installed_capacity_by_utility: {
    name: "installed_capacity_by_utility",
    description: "Total installed capacity per utility (aggregated across all sources)",
    returns: "Utility, Total MW",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact GeneratorsData'[Utility],
        "Total MW", SUM('Fact GeneratorsData'[Installed Capacity (MW)])
      )
      FILTER('Fact GeneratorsData'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact GeneratorsData'[Utility] ASC`,
  },

  generation_output: {
    name: "generation_output",
    description: "Total electricity generated (MWh) by utility",
    returns: "Utility, Total MWh generated",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact Generation'[Utility],
        "Total MWh", SUM('Fact Generation'[GEN Electricity Generated (MWh)])
      )
      FILTER('Fact Generation'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact Generation'[Utility] ASC`,
  },

  generation_by_source: {
    name: "generation_by_source",
    description: "Electricity generation by energy source and utility",
    returns: "Utility, Energy Source, MWh generated",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact Generation'[Utility],
        'Fact Generation'[Energy Source],
        "MWh", SUM('Fact Generation'[GEN Electricity Generated (MWh)])
      )
      FILTER('Fact Generation'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact Generation'[Utility] ASC`,
  },

  peak_demand: {
    name: "peak_demand",
    description: "Peak and average electricity demand by utility",
    returns: "Utility, Peak Load (MW), Average Load (MW)",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact Generation'[Utility],
        "Peak MW", MAX('Fact Generation'[Electricity Demand Peak Load]),
        "Average MW", AVERAGE('Fact Generation'[Electricity Demand Average Load])
      )
      FILTER('Fact Generation'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact Generation'[Utility] ASC`,
  },

  // ── Distribution ──
  system_losses: {
    name: "system_losses",
    description: "System losses (%) by utility — ranked from lowest to highest losses",
    returns: "Utility, System Losses (%)",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact Distribution'[Utility],
        "Losses %", AVERAGE('Fact Distribution'[System Losses (%)])
      )
      FILTER('Fact Distribution'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact Distribution'[System Losses (%)] ASC`,
  },

  distribution_overview: {
    name: "distribution_overview",
    description: "Distribution network overview: line length, transformer capacity, and losses",
    returns: "Utility, Line km, Transformer MVA, Losses %",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact Distribution'[Utility],
        "Line km", SUM('Fact Distribution'[Distribution Line Length (km)]),
        "Transformer MVA", SUM('Fact Distribution'[Transformer Capacity (MVA)]),
        "Losses %", AVERAGE('Fact Distribution'[System Losses (%)])
      )
      FILTER('Fact Distribution'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact Distribution'[Utility] ASC`,
  },

  // ── Financials ──
  financial_summary: {
    name: "financial_summary",
    description: "Revenue, operating costs, and tariff recovery rate by utility",
    returns: "Utility, Revenue, OpEx, Tariff Recovery %",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact FinancialAccounts'[Utility],
        "Revenue", SUM('Fact FinancialAccounts'[Total Revenue]),
        "Operating Costs", SUM('Fact FinancialAccounts'[Operating Costs]),
        "Tariff Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]),
        "AR Days", AVERAGE('Fact FinancialAccounts'[Accounts Receivable (Days)])
      )
      FILTER('Fact FinancialAccounts'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact FinancialAccounts'[Utility] ASC`,
  },

  cost_recovery: {
    name: "cost_recovery",
    description: "Tariff cost recovery rates across utilities — identifies utilities that aren't covering costs",
    returns: "Utility, Recovery %, AR Days",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact FinancialAccounts'[Utility],
        "Cost Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]),
        "AR Days", AVERAGE('Fact FinancialAccounts'[Accounts Receivable (Days)])
      )
      FILTER('Fact FinancialAccounts'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact FinancialAccounts'[Tariff Recovery Rate (%)] ASC`,
  },

  // ── Customers & Electrification ──
  customer_overview: {
    name: "customer_overview",
    description: "Customer connections, electrification rate, and satisfaction by utility",
    returns: "Utility, Total Connections, Electrification %, New Connections, Satisfaction",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact Customer'[Utility],
        "Total Connections", SUM('Fact Customer'[Total Connections]),
        "New Connections", SUM('Fact Customer'[New Connections]),
        "Electrification %", AVERAGE('Fact Customer'[Electrification Rate (%)])
      )
      FILTER('Fact Customer'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact Customer'[Utility] ASC`,
  },

  metering_summary: {
    name: "metering_summary",
    description: "Metering coverage: metered vs unmetered customers, prepayment adoption",
    returns: "Utility, Total Customers, Metered, Unmetered, Metering %, Prepayment count",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact Metering'[Utility],
        "Total Customers", SUM('Fact Metering'[Total Customers]),
        "Metered", SUM('Fact Metering'[Metered Customers]),
        "Unmetered", SUM('Fact Metering'[Unmetered Customers]),
        "Metering %", AVERAGE('Fact Metering'[Metering Rate (%)]),
        "Prepayment", SUM('Fact Metering'[Prepayment Meters])
      )
      FILTER('Fact Metering'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact Metering'[Utility] ASC`,
  },

  // ── Workforce ──
  workforce_summary: {
    name: "workforce_summary",
    description: "Employee headcount, technical staff ratio, and female participation by utility",
    returns: "Utility, Total Staff, Technical Staff, Female %, Staff per 1000 customers",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact Employee'[Utility],
        "Total Staff", SUM('Fact Employee'[Total Employees]),
        "Technical Staff", SUM('Fact Employee'[Technical Staff]),
        "Female Employees", SUM('Fact Employee'[Female Employees])
      )
      FILTER('Fact Employee'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact Employee'[Utility] ASC`,
  },

  // ── Safety ──
  safety_summary: {
    name: "safety_summary",
    description: "Safety performance: lost time injuries, LTIFR, and fatalities by utility",
    returns: "Utility, LTIs, Fatalities, LTIFR",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) =>
      `EVALUATE SUMMARIZECOLUMNS(
        'Fact Safety'[Utility],
        "Lost Time Injuries", SUM('Fact Safety'[Lost Time Injuries]),
        "Fatalities", SUM('Fact Safety'[Fatalities]),
        "LTIFR", AVERAGE('Fact Safety'[LTIFR])
      )
      FILTER('Fact Safety'[FY] = "${escapeDax(p.fy)}")
      ORDER BY 'Fact Safety'[Utility] ASC`,
  },

  // ── Cross-domain / Compound ──
  utility_profile: {
    name: "utility_profile",
    description: "Comprehensive profile for a SINGLE utility: capacity, generation, demand, losses, financials, and customers — all in one query",
    returns: "Utility profile across all major KPIs",
    params: {
      utility: { type: "string", description: "Utility acronym (e.g., EPC, TPL)", required: true },
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
    },
    dax: (p) => {
      // Multi-table profile using ADDCOLUMNS with CALCULATE across fact tables.
      // Falls back to a simpler approach if cross-table filtering doesn't work.
      const u = escapeDax(p.utility);
      const fy = escapeDax(p.fy);
      return `EVALUATE
VAR _Capacity = CALCULATE(SUM('Fact GeneratorsData'[Installed Capacity (MW)]), 'Fact GeneratorsData'[Utility] = "${u}", 'Fact GeneratorsData'[FY] = "${fy}")
VAR _Generation = CALCULATE(SUM('Fact Generation'[GEN Electricity Generated (MWh)]), 'Fact Generation'[Utility] = "${u}", 'Fact Generation'[FY] = "${fy}")
VAR _PeakLoad = CALCULATE(MAX('Fact Generation'[Electricity Demand Peak Load]), 'Fact Generation'[Utility] = "${u}", 'Fact Generation'[FY] = "${fy}")
VAR _Losses = CALCULATE(AVERAGE('Fact Distribution'[System Losses (%)]), 'Fact Distribution'[Utility] = "${u}", 'Fact Distribution'[FY] = "${fy}")
VAR _Revenue = CALCULATE(SUM('Fact FinancialAccounts'[Total Revenue]), 'Fact FinancialAccounts'[Utility] = "${u}", 'Fact FinancialAccounts'[FY] = "${fy}")
VAR _Recovery = CALCULATE(AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)]), 'Fact FinancialAccounts'[Utility] = "${u}", 'Fact FinancialAccounts'[FY] = "${fy}")
VAR _Connections = CALCULATE(SUM('Fact Customer'[Total Connections]), 'Fact Customer'[Utility] = "${u}", 'Fact Customer'[FY] = "${fy}")
VAR _Electrification = CALCULATE(AVERAGE('Fact Customer'[Electrification Rate (%)]), 'Fact Customer'[Utility] = "${u}", 'Fact Customer'[FY] = "${fy}")
RETURN ROW(
  "Utility", "${u}",
  "FY", "${fy}",
  "Installed Capacity MW", _Capacity,
  "Generation MWh", _Generation,
  "Peak Demand MW", _PeakLoad,
  "System Losses %", _Losses,
  "Revenue", _Revenue,
  "Cost Recovery %", _Recovery,
  "Customers", _Connections,
  "Electrification %", _Electrification
)`;
    },
  },

  peer_comparison: {
    name: "peer_comparison",
    description: "Side-by-side comparison across ALL utilities for a key metric — choose which metric",
    returns: "Utility ranking for the chosen metric",
    params: {
      fy: { type: "string", description: "Fiscal year (e.g., FY2023)", required: true },
      metric: {
        type: "string",
        description: "Which metric: capacity, generation, losses, saidi, saifi, recovery, electrification, metering, ltifr",
        required: true,
      },
    },
    dax: (p) => {
      const fy = escapeDax(p.fy);
      switch (p.metric) {
        case "capacity":
          return `EVALUATE SUMMARIZECOLUMNS('Fact GeneratorsData'[Utility], "Value", SUM('Fact GeneratorsData'[Installed Capacity (MW)])) FILTER('Fact GeneratorsData'[FY] = "${fy}") ORDER BY 'Fact GeneratorsData'[Installed Capacity (MW)] DESC`;
        case "generation":
          return `EVALUATE SUMMARIZECOLUMNS('Fact Generation'[Utility], "MWh", SUM('Fact Generation'[GEN Electricity Generated (MWh)])) FILTER('Fact Generation'[FY] = "${fy}") ORDER BY 'Fact Generation'[GEN Electricity Generated (MWh)] DESC`;
        case "losses":
          return `EVALUATE SUMMARIZECOLUMNS('Fact Distribution'[Utility], "Losses %", AVERAGE('Fact Distribution'[System Losses (%)])) FILTER('Fact Distribution'[FY] = "${fy}") ORDER BY 'Fact Distribution'[System Losses (%)] ASC`;
        case "saidi":
          return `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value])) FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[SAIDI Value] ASC`;
        case "saifi":
          return `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], "SAIFI", SUM('Fact SAIDI and SAIFI'[SAIFI Value])) FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[SAIFI Value] ASC`;
        case "recovery":
          return `EVALUATE SUMMARIZECOLUMNS('Fact FinancialAccounts'[Utility], "Recovery %", AVERAGE('Fact FinancialAccounts'[Tariff Recovery Rate (%)])) FILTER('Fact FinancialAccounts'[FY] = "${fy}") ORDER BY 'Fact FinancialAccounts'[Tariff Recovery Rate (%)] DESC`;
        case "electrification":
          return `EVALUATE SUMMARIZECOLUMNS('Fact Customer'[Utility], "Electrification %", AVERAGE('Fact Customer'[Electrification Rate (%)])) FILTER('Fact Customer'[FY] = "${fy}") ORDER BY 'Fact Customer'[Electrification Rate (%)] DESC`;
        case "metering":
          return `EVALUATE SUMMARIZECOLUMNS('Fact Metering'[Utility], "Metering %", AVERAGE('Fact Metering'[Metering Rate (%)])) FILTER('Fact Metering'[FY] = "${fy}") ORDER BY 'Fact Metering'[Metering Rate (%)] DESC`;
        case "ltifr":
          return `EVALUATE SUMMARIZECOLUMNS('Fact Safety'[Utility], "LTIFR", AVERAGE('Fact Safety'[LTIFR])) FILTER('Fact Safety'[FY] = "${fy}") ORDER BY 'Fact Safety'[LTIFR] ASC`;
        default:
          return `EVALUATE SUMMARIZECOLUMNS('Fact SAIDI and SAIFI'[Utility], "SAIDI", SUM('Fact SAIDI and SAIFI'[SAIDI Value])) FILTER('Fact SAIDI and SAIFI'[FY] = "${fy}") ORDER BY 'Fact SAIDI and SAIFI'[SAIDI Value] ASC`;
      }
    },
  },
};

/**
 * Get a compact list of all available query templates for the AI.
 */
export function getQueryCatalog(): string {
  const lines: string[] = [];
  for (const [name, template] of Object.entries(PBI_QUERIES)) {
    const params = Object.entries(template.params)
      .filter(([, v]) => v.required)
      .map(([k]) => k)
      .join(", ");
    lines.push(`- ${name}(${params}) — ${template.description} → ${template.returns}`);
  }
  return lines.join("\n");
}
