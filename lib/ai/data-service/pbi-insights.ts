/**
 * Power BI Insights Engine
 *
 * Automated reporting, risk scoring, proactive alert generation,
 * benchmarking intelligence, and donor report generation.
 * Designed for Pacific Island utility stakeholders.
 */

import type { AiToolResult } from "../types";
import { createToolMetadata } from "./common";

// ═══════════════════════════════════════════════════════
// RISK SCORING
// ═══════════════════════════════════════════════════════

export interface UtilityRiskScore {
  utility: string;
  scores: {
    diesel_dependence: number;     // 0-100, higher = more dependent on diesel
    reliability: number;           // 0-100, higher = worse SAIDI
    financial: number;             // 0-100, higher = worse recovery
    electrification: number;       // 0-100, higher = lower electrification
    climate_exposure: number;      // 0-100, higher = more islands = more vulnerable
  };
  overall: number;                 // 0-100 weighted composite
  risk_level: "critical" | "high" | "moderate" | "low";
  top_concerns: string[];
}

export function computeRiskScores(
  rows: Record<string, unknown>[],
): AiToolResult<{ risks: UtilityRiskScore[]; summary: string }> {
  if (rows.length === 0) {
    return {
      data: { risks: [], summary: "No data available for risk scoring." },
      metadata: createToolMetadata({ source: "powerbi_insights" }),
    };
  }

  // Extract metrics
  const metrics: Record<string, { saidi: number; diesel: number; total: number; recovery: number; electrification: number; islands: number }> = {};

  for (const row of rows) {
    const utility = (row.Utility || row.Utility) as string;
    if (!utility) continue;

    const saidi = typeof row.SAIDI === "number" ? row.SAIDI : 0;
    const diesel = typeof row["Diesel MW"] === "number" ? row["Diesel MW"] : 0;
    const total = typeof row["Total MW"] === "number" ? row["Total MW"] : 1;
    const recovery = typeof row["Recovery %"] === "number" ? row["Recovery %"] : 100;
    const electrification = typeof row["Electrification %"] === "number" ? row["Electrification %"] : 100;
    const islands = typeof row.Islands === "number" ? row.Islands : 1;

    metrics[utility] = { saidi, diesel, total, recovery, electrification, islands };
  }

  // Find max values for normalization
  const all = Object.values(metrics);
  const maxSaidi = Math.max(...all.map((m) => m.saidi), 1);
  const maxDieselRatio = Math.max(...all.map((m) => m.diesel / m.total), 0.01);
  const minRecovery = Math.min(...all.map((m) => m.recovery), 100);
  const minElectrification = Math.min(...all.map((m) => m.electrification), 100);
  const maxIslands = Math.max(...all.map((m) => m.islands), 1);

  const risks: UtilityRiskScore[] = [];

  for (const [utility, m] of Object.entries(metrics)) {
    const dieselRatio = m.diesel / m.total;
    const dieselScore = Math.round((dieselRatio / maxDieselRatio) * 100);
    const reliabilityScore = Math.round((m.saidi / maxSaidi) * 100);
    const financialScore = Math.round(((100 - m.recovery) / (100 - minRecovery || 1)) * 100);
    const electrificationScore = Math.round(((100 - m.electrification) / (100 - minElectrification || 1)) * 100);
    const climateScore = Math.round((m.islands / maxIslands) * 100);

    const overall = Math.round(
      dieselScore * 0.25 + reliabilityScore * 0.25 + financialScore * 0.20 + electrificationScore * 0.15 + climateScore * 0.15,
    );

    const riskLevel = overall >= 70 ? "critical" : overall >= 50 ? "high" : overall >= 30 ? "moderate" : "low";

    const concerns: string[] = [];
    if (dieselScore >= 70) concerns.push("Heavy diesel dependence — vulnerable to fuel price shocks");
    if (reliabilityScore >= 70) concerns.push("Poor reliability — high SAIDI indicates fragile infrastructure");
    if (financialScore >= 70) concerns.push("Financial distress — tariffs not covering operating costs");
    if (electrificationScore >= 70) concerns.push("Low electrification — significant access gap remains");
    if (climateScore >= 70) concerns.push("High climate exposure — multi-island geography increases risk");

    risks.push({
      utility,
      scores: {
        diesel_dependence: dieselScore,
        reliability: reliabilityScore,
        financial: financialScore,
        electrification: electrificationScore,
        climate_exposure: climateScore,
      },
      overall,
      risk_level: riskLevel,
      top_concerns: concerns.slice(0, 3),
    });
  }

  risks.sort((a, b) => b.overall - a.overall);

  const critical = risks.filter((r) => r.risk_level === "critical").length;
  const high = risks.filter((r) => r.risk_level === "high").length;
  const summary = `${risks.length} utilities assessed. ${critical} critical risk, ${high} high risk. Top concern: ${risks[0]?.top_concerns[0] || "insufficient data"}.`;

  return {
    data: { risks, summary },
    metadata: createToolMetadata({ source: "powerbi_insights" }),
  };
}

// ═══════════════════════════════════════════════════════
// AUTOMATED REPORTING
// ═══════════════════════════════════════════════════════

export interface ReportSection {
  heading: string;
  content: string;
  data_table?: { columns: string[]; rows: Record<string, unknown>[] };
  insight?: string;
}

export interface AutomatedReport {
  title: string;
  generated_at: string;
  sections: ReportSection[];
  executive_summary: string;
}

export function generatePerformanceReport(
  utility: string,
  fy: string,
  data: Record<string, Record<string, unknown>[]>,
): AiToolResult<AutomatedReport> {
  const sections: ReportSection[] = [];
  const keyFindings: string[] = [];

  // Section 1: Overview
  const profile = data.utility_profile?.[0] || {};
  sections.push({
    heading: "1. Utility Overview",
    content: `Performance summary for ${utility} in ${fy}.`,
    data_table: {
      columns: ["Metric", "Value"],
      rows: Object.entries(profile).map(([k, v]) => ({ Metric: k, Value: v })),
    },
  });

  // Section 2: Reliability
  const saidi = data.saidi_by_utility || [];
  const utilSaidi = saidi.find((r) => r.Utility === utility) as Record<string, unknown> | undefined;
  if (utilSaidi) {
    const saidiVal = utilSaidi.SAIDI;
    sections.push({
      heading: "2. Reliability (SAIDI/SAIFI)",
      content: `${utility} recorded a SAIDI of ${saidiVal || "N/A"} minutes in ${fy}.`,
      insight: typeof saidiVal === "number" && saidiVal > 500 ? "SAIDI exceeds regional benchmarks. Prioritize feeder hardening and vegetation management." : "SAIDI is within acceptable range. Continue existing maintenance programs.",
    });
    if (typeof saidiVal === "number") keyFindings.push(`SAIDI: ${saidiVal} minutes`);
  }

  // Section 3: System Losses
  const losses = data.system_losses || [];
  const utilLosses = losses.find((r) => r.Utility === utility) as Record<string, unknown> | undefined;
  if (utilLosses) {
    const lossVal = utilLosses["Losses %"];
    sections.push({
      heading: "3. System Losses",
      content: `${utility} reported system losses of ${lossVal || "N/A"}% in ${fy}.`,
      insight: typeof lossVal === "number" && lossVal > 15 ? "Losses exceed 15% — investigate non-technical losses and aging distribution infrastructure." : "Losses within target range.",
    });
    if (typeof lossVal === "number") keyFindings.push(`System Losses: ${lossVal}%`);
  }

  // Section 4: Financial
  const financials = data.cost_recovery || [];
  const utilFin = financials.find((r) => r.Utility === utility) as Record<string, unknown> | undefined;
  if (utilFin) {
    const recovery = utilFin["Recovery %"] || utilFin["Cost Recovery %"];
    sections.push({
      heading: "4. Financial Sustainability",
      content: `${utility} achieved a cost recovery rate of ${recovery || "N/A"}% in ${fy}.`,
      insight: typeof recovery === "number" && recovery < 100 ? `Operating at a deficit. Revenue covers only ${recovery}% of costs. Tariff review recommended.` : "Cost recovery is adequate.",
    });
    if (typeof recovery === "number") keyFindings.push(`Cost Recovery: ${recovery}%`);
  }

  // Section 5: Customers
  const customers = data.customer_overview || [];
  const utilCust = customers.find((r) => r.Utility === utility) as Record<string, unknown> | undefined;
  if (utilCust) {
    const electrification = utilCust["Electrification %"];
    const connections = utilCust["Total Connections"];
    sections.push({
      heading: "5. Customer Access & Electrification",
      content: `${utility} serves ${connections || "N/A"} customers with an electrification rate of ${electrification || "N/A"}%.`,
      insight: typeof electrification === "number" && electrification < 90 ? `Electrification below 90% — rural/island outreach program recommended.` : "Electrification rate is strong.",
    });
  }

  // Section 6: Recommendations
  const concerns: string[] = [];
  if (data.anomalies && (data.anomalies as unknown[]).length > 0) {
    concerns.push("Anomalies detected in performance data — see detailed analysis");
  }

  sections.push({
    heading: "6. Recommendations & Next Steps",
    content: concerns.length > 0 ? concerns.join("\n") : "No urgent concerns identified. Continue monitoring KPIs quarterly.",
  });

  const summary = keyFindings.length > 0
    ? `${utility} in ${fy}: ${keyFindings.join(". ")}.`
    : `Performance report for ${utility} in ${fy}.`;

  return {
    data: {
      title: `${utility} Performance Report — ${fy}`,
      generated_at: new Date().toISOString(),
      sections,
      executive_summary: summary,
    },
    metadata: createToolMetadata({ source: "powerbi_insights" }),
  };
}

// ═══════════════════════════════════════════════════════
// PROACTIVE ALERTS
// ═══════════════════════════════════════════════════════

export interface ProactiveAlert {
  utility: string;
  severity: "critical" | "warning" | "info";
  category: string;
  message: string;
  recommendation: string;
  metric_current: number;
  metric_threshold: number;
}

export function generateProactiveAlerts(
  rows: Record<string, unknown>[],
  queryName: string,
): AiToolResult<{ alerts: ProactiveAlert[]; checked: number }> {
  const alerts: ProactiveAlert[] = [];

  const thresholds: Record<string, { field: string; threshold: number; direction: "above" | "below"; category: string; msg: string; rec: string }> = {
    system_losses: { field: "Losses %", threshold: 15, direction: "above", category: "Efficiency", msg: "System losses exceed 15%", rec: "Conduct loss reduction study; prioritize metering and anti-theft measures" },
    cost_recovery: { field: "Cost Recovery %", threshold: 80, direction: "below", category: "Financial", msg: "Cost recovery below 80%", rec: "Initiate tariff review; explore cost reduction opportunities" },
    saidi_by_utility: { field: "SAIDI", threshold: 500, direction: "above", category: "Reliability", msg: "SAIDI exceeds 500 hours", rec: "Prioritize feeder hardening; develop vegetation management plan" },
    diesel_dependence: { field: "Diesel MW", threshold: 70, direction: "above", category: "Fuel Risk", msg: "Diesel dependence exceeds 70% of capacity", rec: "Explore renewable integration; assess solar/battery feasibility" },
    electrification_trend: { field: "Electrification %", threshold: 80, direction: "below", category: "Access", msg: "Electrification below 80%", rec: "Develop rural electrification plan; seek grant funding for last-mile connections" },
    safety_summary: { field: "LTIFR", threshold: 5, direction: "above", category: "Safety", msg: "LTIFR exceeds 5", rec: "Review safety protocols; increase safety training frequency" },
  };

  const rule = thresholds[queryName];
  if (!rule) {
    return { data: { alerts: [], checked: rows.length }, metadata: createToolMetadata({ source: "powerbi_insights" }) };
  }

  for (const row of rows) {
    const utility = (row.Utility || row.Utility || "unknown") as string;
    const value = row[rule.field];

    if (typeof value !== "number" || isNaN(value)) continue;

    const triggered = rule.direction === "above" ? value > rule.threshold : value < rule.threshold;

    if (triggered) {
      const severity = rule.direction === "above"
        ? (value > rule.threshold * 2 ? "critical" : "warning")
        : (value < rule.threshold * 0.5 ? "critical" : "warning");

      alerts.push({
        utility,
        severity,
        category: rule.category,
        message: `${rule.msg}: ${utility} at ${value}`,
        recommendation: rule.rec,
        metric_current: value,
        metric_threshold: rule.threshold,
      });
    }
  }

  alerts.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));

  return {
    data: { alerts, checked: rows.length },
    metadata: createToolMetadata({ source: "powerbi_insights" }),
  };
}

// ═══════════════════════════════════════════════════════
// BENCHMARKING WITH ISLAND CONTEXT
// ═══════════════════════════════════════════════════════

export interface IslandPeerGroup {
  group_name: string;
  group_criteria: string;
  utilities: string[];
  averages: Record<string, number>;
  your_utility?: string;
  your_rank?: number;
}

export function generatePeerGroups(
  rows: Record<string, unknown>[],
  options: { your_utility?: string } = {},
): AiToolResult<{ groups: IslandPeerGroup[]; message: string }> {
  const groups: IslandPeerGroup[] = [];

  // Group 1: By customer size
  const smallUtils: string[] = [];
  const mediumUtils: string[] = [];
  const largeUtils: string[] = [];

  for (const row of rows) {
    const utility = (row.Utility || row.Utility) as string;
    const customers = row.Customers || row["Total Connections"] || row["Total Customers"];
    if (!utility) continue;

    const custCount = typeof customers === "number" ? customers : 0;
    if (custCount < 10000) smallUtils.push(utility);
    else if (custCount < 50000) mediumUtils.push(utility);
    else largeUtils.push(utility);
  }

  if (smallUtils.length > 0) {
    groups.push({
      group_name: "Small Island Utilities",
      group_criteria: "Fewer than 10,000 customers",
      utilities: smallUtils,
      averages: {},
    });
  }
  if (mediumUtils.length > 0) {
    groups.push({
      group_name: "Medium Utilities",
      group_criteria: "10,000–50,000 customers",
      utilities: mediumUtils,
      averages: {},
    });
  }
  if (largeUtils.length > 0) {
    groups.push({
      group_name: "Large Utilities",
      group_criteria: "Over 50,000 customers",
      utilities: largeUtils,
      averages: {},
    });
  }

  // Determine user's group and rank
  let userGroup = "";
  if (options.your_utility) {
    if (smallUtils.includes(options.your_utility)) userGroup = "Small Island Utilities";
    else if (mediumUtils.includes(options.your_utility)) userGroup = "Medium Utilities";
    else if (largeUtils.includes(options.your_utility)) userGroup = "Large Utilities";
  }

  return {
    data: {
      groups,
      message: userGroup
        ? `Your utility (${options.your_utility}) is grouped with: ${userGroup}. You're benchmarked against ${groups.find((g) => g.group_name === userGroup)?.utilities.length || 0} peers.`
        : `${groups.length} peer groups identified.`,
    },
    metadata: createToolMetadata({ source: "powerbi_insights" }),
  };
}

// ═══════════════════════════════════════════════════════
// DONOR REPORT TEMPLATES
// ═══════════════════════════════════════════════════════

export interface DonorReportTemplate {
  donor: string;
  typical_requirements: string[];
  relevant_kpis: string[];
  suggested_query: string;
  narrative_template: string;
}

export const DONOR_REPORT_TEMPLATES: Record<string, DonorReportTemplate> = {
  ppa: {
    donor: "Pacific Power Association (PPA)",
    typical_requirements: ["SAIDI/SAIFI", "System losses", "Electrification rate", "Tariff recovery", "Renewable share"],
    relevant_kpis: ["SAIDI", "SAIFI", "System Losses %", "Electrification %", "Cost Recovery %", "Renewable MW / Total MW"],
    suggested_query: "vulnerability_dashboard",
    narrative_template: "In {fy}, {utility} served {customers} customers across {islands} islands. Reliability (SAIDI: {saidi} min) is {saidi_trend}. System losses are {losses}%, with a cost recovery rate of {recovery}%. Renewable energy accounts for {renewable}% of rated capacity.",
  },
  adb: {
    donor: "Asian Development Bank (ADB)",
    typical_requirements: ["Financial sustainability", "Tariff affordability", "Gender diversity", "Poverty impact", "Climate resilience"],
    relevant_kpis: ["Cost Recovery %", "Tariff Rate per kWh vs GDP per Capita", "Female Employees %", "Electrification %", "SAIDI"],
    suggested_query: "tariff_affordability",
    narrative_template: "The {utility} utility operates in a {context} context. Financial sustainability is {recovery}% cost recovery. Gender diversity stands at {female}% female workforce. The electrification rate is {electrification}%, with {unelectrified} people still without access.",
  },
  worldbank: {
    donor: "World Bank",
    typical_requirements: ["Governance", "Operational efficiency", "Financial viability", "Environmental sustainability", "Social inclusion"],
    relevant_kpis: ["SAIDI", "System Losses %", "Cost Recovery %", "Renewable %", "Customers per Employee", "Female Participation"],
    suggested_query: "composite_score",
    narrative_template: "{utility} demonstrates {governance} governance and {efficiency} operational efficiency. The utility serves {customers} customers with {reliability} reliability. Financial viability is {viability} with a renewable energy share of {renewable}%.",
  },
  gcf: {
    donor: "Green Climate Fund (GCF)",
    typical_requirements: ["GHG emissions baseline", "Climate vulnerability", "Renewable energy potential", "Adaptation benefits", "Mitigation impact"],
    relevant_kpis: ["Diesel MW / Total MW", "Renewable MW", "SAIDI trend", "Island Count", "Electrification %"],
    suggested_query: "climate_risk_profile",
    narrative_template: "{utility} is {diesel}% diesel-dependent, emitting approximately {emissions} tCO2/year. Climate vulnerability is {vulnerability} (based on island geography and infrastructure resilience). The proposed project would add {renewable}MW of renewable capacity, displacing {displaced}% of diesel generation and reducing emissions by {reduction} tCO2/year.",
  },
  nz_mfat: {
    donor: "NZ MFAT (New Zealand Ministry of Foreign Affairs and Trade)",
    typical_requirements: ["Pacific regional context", "Community impact", "Gender equality", "Climate resilience", "Institutional strengthening"],
    relevant_kpis: ["Electrification %", "Female Employees %", "SAIDI", "Island Count", "Renewable %"],
    suggested_query: "vulnerability_dashboard",
    narrative_template: "As a {island_count}-island utility serving {customers} customers, {utility} faces unique challenges in {challenges}. This project supports {benefit} across {islands} islands, with specific focus on {focus}.",
  },
};

export function getDonorTemplates(donor?: string): AiToolResult<{ templates: DonorReportTemplate[]; available_donors: string[] }> {
  if (donor) {
    const template = DONOR_REPORT_TEMPLATES[donor.toLowerCase()];
    if (!template) {
      return {
        data: { templates: [], available_donors: Object.keys(DONOR_REPORT_TEMPLATES) },
        metadata: createToolMetadata({ source: "powerbi_insights" }),
        error: `Unknown donor "${donor}". Available: ${Object.keys(DONOR_REPORT_TEMPLATES).join(", ")}`,
      };
    }
    return {
      data: { templates: [template], available_donors: Object.keys(DONOR_REPORT_TEMPLATES) },
      metadata: createToolMetadata({ source: "powerbi_insights" }),
    };
  }

  return {
    data: {
      templates: Object.values(DONOR_REPORT_TEMPLATES),
      available_donors: Object.keys(DONOR_REPORT_TEMPLATES),
    },
    metadata: createToolMetadata({ source: "powerbi_insights" }),
  };
}

// ═══════════════════════════════════════════════════════
// RENEWABLE PLANNING
// ═══════════════════════════════════════════════════════

export interface RenewableScenario {
  utility: string;
  current_diesel_mw: number;
  current_renewable_mw: number;
  current_total_mw: number;
  scenario_solar_mw: number;
  scenario_battery_mwh: number;
  projected_diesel_displacement_mwh: number;
  projected_diesel_savings_percent: number;
  estimated_annual_savings_note: string;
}

export function generateRenewableScenario(
  rows: Record<string, unknown>[],
  options: { additional_solar_mw?: number; additional_battery_mwh?: number },
): AiToolResult<{ scenarios: RenewableScenario[]; assumptions: string }> {
  const solarMW = options.additional_solar_mw || 5;
  const batteryMWh = options.additional_battery_mwh || 10;
  const scenarios: RenewableScenario[] = [];

  for (const row of rows) {
    const utility = (row.Utility || row.Utility) as string;
    if (!utility) continue;

    const dieselMW = typeof row["Diesel MW"] === "number" ? row["Diesel MW"] : 0;
    const renewableMW = typeof row["Renewable MW"] === "number" ? row["Renewable MW"] : 0;
    const totalMW = typeof row["Total MW"] === "number" ? row["Total MW"] : 1;

    const displacementPct = Math.min(Math.round((solarMW / dieselMW) * 100), 100);

    scenarios.push({
      utility,
      current_diesel_mw: dieselMW,
      current_renewable_mw: renewableMW,
      current_total_mw: totalMW,
      scenario_solar_mw: solarMW,
      scenario_battery_mwh: batteryMWh,
      projected_diesel_displacement_mwh: Math.round(dieselMW * 8760 * 0.25 * (solarMW / Math.max(dieselMW, 1))),
      projected_diesel_savings_percent: displacementPct,
      estimated_annual_savings_note: `Adding ${solarMW}MW solar + ${batteryMWh}MWh battery could displace approximately ${displacementPct}% of diesel generation. Actual savings depend on solar irradiance, load profile, and existing PPA terms.`,
    });
  }

  return {
    data: {
      scenarios,
      assumptions: `Model assumes: ${solarMW}MW solar PV addition with ${batteryMWh}MWh battery storage. 25% capacity factor for solar. Diesel displacement proportional to solar/diesel ratio. Does not account for grid stability constraints, land availability, or detailed financial modeling.`,
    },
    metadata: createToolMetadata({ source: "powerbi_insights" }),
  };
}
