/**
 * Power BI Advanced Analytics
 *
 * Trend forecasting, similarity matching, KPI correlation, investment
 * prioritization, executive briefings, data completeness, regulatory
 * tracking, tariff simulation, capacity building, and auto-fill donor apps.
 */

import type { AiToolResult } from "../types";
import { createToolMetadata } from "./common";
import { DONOR_REPORT_TEMPLATES } from "./pbi-insights";

// ═══════════════════════════════════════════════════════
// TREND FORECASTING (Linear Regression)
// ═══════════════════════════════════════════════════════

export interface TrendForecast {
  utility: string;
  metric: string;
  historical: Array<{ period: string; value: number }>;
  projected: Array<{ period: string; value: number }>;
  slope: number;
  direction: "improving" | "deteriorating" | "stable";
  r_squared: number;
  summary: string;
}

export function forecastTrend(
  rows: Record<string, unknown>[],
  options: { metric: string; periods_ahead?: number; utility?: string },
): AiToolResult<{ forecasts: TrendForecast[] }> {
  const periodsAhead = options.periods_ahead || 2;
  const forecasts: TrendForecast[] = [];

  if (rows.length < 2) {
    return { data: { forecasts: [] }, metadata: createToolMetadata({ source: "analytics" }), error: "Need at least 2 data points for forecasting" };
  }

  // Group by utility
  const byUtility = new Map<string, Array<{ period: string; value: number }>>();
  for (const row of rows) {
    const utility = (row.Utility || row.Utility || "All") as string;
    if (options.utility && utility !== options.utility) continue;
    const fy = (row.FY || row.FY || "") as string;
    const value = row[options.metric];
    if (typeof value !== "number" || isNaN(value)) continue;
    const points = byUtility.get(utility) || [];
    points.push({ period: fy, value });
    byUtility.set(utility, points);
  }

  for (const [utility, points] of byUtility) {
    if (points.length < 2) continue;

    // Linear regression: y = slope * x + intercept
    const n = points.length;
    const xValues = points.map((_, i) => i);
    const yValues = points.map((p) => p.value);
    const sumX = xValues.reduce((s, v) => s + v, 0);
    const sumY = yValues.reduce((s, v) => s + v, 0);
    const sumXY = xValues.reduce((s, x, i) => s + x * yValues[i], 0);
    const sumX2 = xValues.reduce((s, v) => s + v * v, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    const meanY = sumY / n;
    const ssRes = yValues.reduce((s, y, i) => s + (y - (slope * xValues[i] + intercept)) ** 2, 0);
    const ssTot = yValues.reduce((s, y) => s + (y - meanY) ** 2, 0);
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    const projected: Array<{ period: string; value: number }> = [];
    for (let i = 0; i < periodsAhead; i++) {
      const nextIndex = n + i;
      const nextValue = Math.round((slope * nextIndex + intercept) * 100) / 100;
      const nextPeriod = `Projected +${i + 1}`;
      projected.push({ period: nextPeriod, value: Math.max(0, nextValue) });
    }

    const direction = Math.abs(slope) < points[0].value * 0.02 ? "stable" : slope > 0 ? "deteriorating" : "improving";

    const metricLabels: Record<string, string> = {
      SAIDI: "SAIDI improvement", Losses: "losses reduction", LossesPct: "losses trend",
      "Losses %": "system losses", "Recovery %": "cost recovery", Electrification: "electrification progress",
      "Electrification %": "electrification rate", "Total MWh": "generation output",
    };
    const label = metricLabels[options.metric] || options.metric;

    forecasts.push({
      utility,
      metric: options.metric,
      historical: points,
      projected,
      slope: Math.round(slope * 10000) / 10000,
      direction,
      r_squared: Math.round(rSquared * 1000) / 1000,
      summary: `${utility}'s ${label} is ${direction}. ${direction === "improving" ? "At this rate, " + label + " will continue improving." : direction === "deteriorating" ? "⚠️ " + label + " is getting worse — intervention may be needed." : `${label} is stable with no significant trend.`} (R² = ${Math.round(rSquared * 100)}%)`,
    });
  }

  return { data: { forecasts }, metadata: createToolMetadata({ source: "analytics" }) };
}

// ═══════════════════════════════════════════════════════
// HISTORICAL BEST/WORST FINDER
// ═══════════════════════════════════════════════════════

export interface PeriodExtreme {
  period: string;
  value: number;
  is_best: boolean;
  context: string;
}

export function findHistoricalExtremes(
  rows: Record<string, unknown>[],
  options: { utility: string; metric: string },
): AiToolResult<{ best: PeriodExtreme | null; worst: PeriodExtreme | null; all_periods: Array<{ period: string; value: number }> }> {
  const utilRows = rows.filter((r) => (r.Utility || r.Utility) === options.utility);
  const periods: Array<{ period: string; value: number }> = [];

  for (const row of utilRows) {
    const period = (row.FY || row.FY || "") as string;
    const value = row[options.metric];
    if (typeof value !== "number" || isNaN(value)) continue;
    periods.push({ period, value });
  }

  if (periods.length === 0) {
    return { data: { best: null, worst: null, all_periods: [] }, metadata: createToolMetadata({ source: "analytics" }), error: "No data found" };
  }

  // For metrics where lower is better (SAIDI, losses, LTIFR) vs higher is better (recovery, electrification)
  const lowerIsBetter = ["SAIDI", "SAIFI", "Losses %", "LTIFR", "Lost Time Injuries", "Fatalities", "Diesel MW"].includes(options.metric);
  periods.sort((a, b) => lowerIsBetter ? a.value - b.value : b.value - a.value);

  const best = periods[0];
  const worst = periods[periods.length - 1];

  const bestCtx = lowerIsBetter
    ? `Best period: ${best.value} (lowest ${options.metric})`
    : `Best period: ${best.value} (highest ${options.metric})`;

  const worstCtx = lowerIsBetter
    ? `Worst period: ${worst.value} (highest ${options.metric})`
    : `Worst period: ${worst.value} (lowest ${options.metric})`;

  return {
    data: {
      best: { ...best, is_best: true, context: bestCtx },
      worst: { ...worst, is_best: false, context: worstCtx },
      all_periods: periods,
    },
    metadata: createToolMetadata({ source: "analytics" }),
  };
}

// ═══════════════════════════════════════════════════════
// UTILITY SIMILARITY MATCHING
// ═══════════════════════════════════════════════════════

export interface SimilarUtility {
  utility: string;
  similarity_score: number;  // 0-1
  shared_traits: string[];
}

export function findSimilarUtilities(
  rows: Record<string, unknown>[],
  options: { target_utility: string },
): AiToolResult<{ matches: SimilarUtility[]; target_profile: Record<string, unknown> }> {
  // Extract feature vectors
  const utilities = new Map<string, Record<string, number>>();
  let targetProfile: Record<string, unknown> = {};

  const features = ["Total MW", "Diesel MW", "Customers", "Islands", "SAIDI", "Losses %", "Recovery %", "Electrification %", "Renewable MW"];

  for (const row of rows) {
    const utility = (row.Utility || row.Utility) as string;
    if (!utility) continue;

    const vec: Record<string, number> = {};
    for (const f of features) {
      const val = row[f];
      vec[f] = typeof val === "number" ? val : 0;
    }
    utilities.set(utility, vec);

    if (utility === options.target_utility) {
      targetProfile = row as Record<string, unknown>;
    }
  }

  const target = utilities.get(options.target_utility);
  if (!target) {
    return { data: { matches: [], target_profile: targetProfile }, metadata: createToolMetadata({ source: "analytics" }), error: `Utility ${options.target_utility} not found in data` };
  }

  // Compute cosine similarity
  const matches: SimilarUtility[] = [];
  for (const [utility, vec] of utilities) {
    if (utility === options.target_utility) continue;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    const sharedTraits: string[] = [];

    for (const f of features) {
      const a = target[f] || 0;
      const b = vec[f] || 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;

      // Check if values are within 30% of each other
      if (a > 0 && b > 0) {
        const ratio = Math.max(a, b) / Math.min(a, b);
        if (ratio <= 1.3) sharedTraits.push(f);
      }
    }

    if (normA === 0 || normB === 0) continue;
    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

    if (similarity > 0.5) {
      matches.push({ utility, similarity_score: Math.round(similarity * 1000) / 1000, shared_traits: sharedTraits });
    }
  }

  matches.sort((a, b) => b.similarity_score - a.similarity_score);

  return {
    data: { matches: matches.slice(0, 10), target_profile: targetProfile },
    metadata: createToolMetadata({ source: "analytics" }),
  };
}

// ═══════════════════════════════════════════════════════
// KPI CORRELATION ENGINE
// ═══════════════════════════════════════════════════════

export interface KpiCorrelation {
  kpi_a: string;
  kpi_b: string;
  pearson_r: number;
  strength: "strong" | "moderate" | "weak" | "none";
  direction: "positive" | "negative";
  interpretation: string;
}

export function computeKpiCorrelations(
  rows: Record<string, unknown>[],
): AiToolResult<{ correlations: KpiCorrelation[]; top_findings: string[] }> {
  const numericKeys = rows.length > 0
    ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] === "number" && k !== "Diesel MW" && k !== "Total MW" && k !== "Renewable MW")
    : [];

  if (numericKeys.length < 2) {
    return { data: { correlations: [], top_findings: [] }, metadata: createToolMetadata({ source: "analytics" }), error: "Need at least 2 numeric columns" };
  }

  const correlations: KpiCorrelation[] = [];
  const topFindings: string[] = [];

  for (let i = 0; i < numericKeys.length; i++) {
    for (let j = i + 1; j < numericKeys.length; j++) {
      const kpiA = numericKeys[i];
      const kpiB = numericKeys[j];

      const values: Array<{ a: number; b: number }> = [];
      for (const row of rows) {
        const a = row[kpiA];
        const b = row[kpiB];
        if (typeof a === "number" && typeof b === "number" && !isNaN(a) && !isNaN(b)) {
          values.push({ a, b });
        }
      }

      if (values.length < 3) continue;

      const n = values.length;
      const sumA = values.reduce((s, v) => s + v.a, 0);
      const sumB = values.reduce((s, v) => s + v.b, 0);
      const sumAB = values.reduce((s, v) => s + v.a * v.b, 0);
      const sumA2 = values.reduce((s, v) => s + v.a * v.a, 0);
      const sumB2 = values.reduce((s, v) => s + v.b * v.b, 0);

      const num = n * sumAB - sumA * sumB;
      const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
      if (den === 0) continue;

      const r = num / den;
      const strength = Math.abs(r) >= 0.7 ? "strong" : Math.abs(r) >= 0.4 ? "moderate" : Math.abs(r) >= 0.2 ? "weak" : "none";

      let interpretation = "";
      if (strength === "strong") {
        interpretation = r > 0
          ? `Strong positive correlation: utilities with higher ${kpiA} tend to have higher ${kpiB}`
          : `Strong negative correlation: utilities with higher ${kpiA} tend to have lower ${kpiB}`;
        topFindings.push(interpretation);
      } else if (strength === "moderate") {
        interpretation = r > 0
          ? `Moderate positive relationship between ${kpiA} and ${kpiB}`
          : `Moderate negative relationship between ${kpiA} and ${kpiB}`;
      }

      correlations.push({
        kpi_a: kpiA,
        kpi_b: kpiB,
        pearson_r: Math.round(r * 1000) / 1000,
        strength,
        direction: r >= 0 ? "positive" : "negative",
        interpretation,
      });
    }
  }

  correlations.sort((a, b) => Math.abs(b.pearson_r) - Math.abs(a.pearson_r));

  return {
    data: { correlations: correlations.slice(0, 20), top_findings: topFindings.slice(0, 5) },
    metadata: createToolMetadata({ source: "analytics" }),
  };
}

// ═══════════════════════════════════════════════════════
// INVESTMENT PRIORITIZATION
// ═══════════════════════════════════════════════════════

export interface InvestmentPriority {
  utility: string;
  priority_score: number;
  rank: number;
  reason: string;
  recommended_action: string;
  estimated_impact: string;
}

export function prioritizeInvestments(
  riskRows: Record<string, unknown>[],
  options: { budget_focus?: "reliability" | "renewable" | "electrification" | "financial" | "all" },
): AiToolResult<{ priorities: InvestmentPriority[]; summary: string }> {
  const priorities: InvestmentPriority[] = [];
  const focus = options.budget_focus || "all";

  for (const row of riskRows) {
    const utility = (row.Utility || row.Utility || "unknown") as string;
    const saidi = typeof row.SAIDI === "number" ? row.SAIDI : 0;
    const diesel = typeof row["Diesel MW"] === "number" ? row["Diesel MW"] : 0;
    const totalMw = typeof row["Total MW"] === "number" ? row["Total MW"] : 1;
    const recovery = typeof row["Recovery %"] === "number" ? row["Recovery %"] : 100;
    const electrification = typeof row["Electrification %"] === "number" ? row["Electrification %"] : 100;
    const dieselPct = diesel / totalMw;

    const saidiScore = Math.min(saidi / 1000, 1);
    const dieselScore = dieselPct;
    const recoveryScore = Math.max(0, (100 - recovery) / 100);
    const electrificationScore = Math.max(0, (100 - electrification) / 100);

    let priorityScore = 0;
    let reason = "";
    let action = "";
    let impact = "";

    switch (focus) {
      case "reliability":
        priorityScore = saidiScore * 0.6 + dieselScore * 0.2 + recoveryScore * 0.2;
        reason = `SAIDI of ${saidi} minutes indicates reliability challenges`;
        action = "Invest in feeder hardening, vegetation management, and network automation";
        impact = `Could reduce SAIDI by an estimated ${Math.round(saidi * 0.3)} minutes`;
        break;
      case "renewable":
        priorityScore = dieselScore * 0.7 + saidiScore * 0.2 + recoveryScore * 0.1;
        reason = `${Math.round(dieselPct * 100)}% diesel dependence — high fuel cost exposure`;
        action = `Install ${Math.round(totalMw * 0.3)}MW solar + ${Math.round(totalMw * 0.6)}MWh battery storage`;
        impact = `Could displace ~${Math.round(dieselPct * 30)}% of diesel consumption`;
        break;
      case "electrification":
        priorityScore = electrificationScore * 0.7 + dieselScore * 0.2 + saidiScore * 0.1;
        reason = `${electrification}% electrification rate — access gap of ${100 - electrification}%`;
        action = "Develop rural electrification plan with mini-grid and solar home system options";
        impact = `Could bring electricity to ${Math.round((100 - electrification) / 100 * 1000)} new households per % gain`;
        break;
      case "financial":
        priorityScore = recoveryScore * 0.7 + dieselScore * 0.2 + saidiScore * 0.1;
        reason = `${recovery}% cost recovery — operating at ${100 - recovery}% deficit`;
        action = "Conduct tariff review and cost optimization study";
        impact = `Each 5% recovery improvement adds ~${Math.round(100 - recovery)}% to net revenue`;
        break;
      default:
        priorityScore = saidiScore * 0.25 + dieselScore * 0.25 + recoveryScore * 0.25 + electrificationScore * 0.25;
        reason = `Multi-factor vulnerability: ${Math.round(priorityScore * 100)}% composite risk score`;
        action = "Prioritize based on most critical factor from vulnerability dashboard";
        impact = "Holistic improvement across reliability, financial, and access dimensions";
    }

    priorities.push({
      utility,
      priority_score: Math.round(priorityScore * 100),
      rank: 0,
      reason,
      recommended_action: action,
      estimated_impact: impact,
    });
  }

  priorities.sort((a, b) => b.priority_score - a.priority_score);
  priorities.forEach((p, i) => { p.rank = i + 1; });

  const top3 = priorities.slice(0, 3).map((p) => p.utility).join(", ");
  const summary = `${priorities.length} utilities assessed. Top 3 priorities: ${top3}. Focus area: ${focus}.`;

  return {
    data: { priorities, summary },
    metadata: createToolMetadata({ source: "analytics" }),
  };
}

// ═══════════════════════════════════════════════════════
// EXECUTIVE BRIEFING GENERATOR
// ═══════════════════════════════════════════════════════

export interface ExecutiveBriefing {
  utility: string;
  period: string;
  key_numbers: Array<{ label: string; value: string; trend: "up" | "down" | "flat"; context: string }>;
  top_trends: string[];
  red_flags: string[];
  recommendations: string[];
  one_liner: string;
}

export function generateExecutiveBriefing(
  utility: string,
  fy: string,
  allData: Record<string, Record<string, unknown>[]>,
  options: { audience?: "board" | "donor" | "regulator" } = {},
): AiToolResult<ExecutiveBriefing> {
  const audience = options.audience || "board";
  const keyNumbers: ExecutiveBriefing["key_numbers"] = [];
  const topTrends: string[] = [];
  const redFlags: string[] = [];
  const recommendations: string[] = [];
  const utilRow = (data: Record<string, unknown>[]) => data.find((r) => (r.Utility || r.Utility) === utility);

  // SAIDI
  const saidiRow = utilRow(allData.saidi_by_utility || []);
  if (saidiRow && typeof saidiRow.SAIDI === "number") {
    const v = saidiRow.SAIDI;
    keyNumbers.push({ label: "SAIDI", value: `${v} min`, trend: v > 500 ? "down" : "up", context: v > 500 ? "Needs attention" : "On track" });
    if (v > 500) { redFlags.push(`SAIDI of ${v} minutes is above the 500-minute benchmark`); recommendations.push("Prioritize reliability improvement program"); }
    if (v < 200) { topTrends.push("Reliability is a strength — SAIDI among the best in the region"); }
  }

  // Losses
  const lossesRow = utilRow(allData.system_losses || []);
  if (lossesRow && typeof lossesRow["Losses %"] === "number") {
    const v = lossesRow["Losses %"];
    keyNumbers.push({ label: "System Losses", value: `${v}%`, trend: v > 15 ? "down" : "up", context: v > 15 ? "Above target" : "Within range" });
    if (v > 15) { redFlags.push(`System losses at ${v}% exceed the 15% threshold`); recommendations.push("Conduct loss reduction study"); }
  }

  // Cost Recovery
  const finRow = utilRow(allData.cost_recovery || allData.financial_summary || []);
  const recoveryVal = finRow?.["Recovery %"] || finRow?.["Cost Recovery %"];
  if (typeof recoveryVal === "number") {
    keyNumbers.push({ label: "Cost Recovery", value: `${recoveryVal}%`, trend: recoveryVal < 100 ? "down" : "up", context: recoveryVal < 100 ? `${100 - recoveryVal}% deficit` : "Fully recovered" });
    if (recoveryVal < 80) { redFlags.push(`Cost recovery at ${recoveryVal}% — operating at a structural deficit`); recommendations.push("Initiate tariff review"); }
  }

  // Electrification
  const custRow = utilRow(allData.customer_overview || []);
  const elecVal = custRow?.["Electrification %"];
  if (typeof elecVal === "number") {
    keyNumbers.push({ label: "Electrification", value: `${elecVal}%`, trend: elecVal > 90 ? "up" : "down", context: `${100 - elecVal}% without access` });
    if (elecVal < 90) { redFlags.push(`${100 - elecVal}% of the population lacks electricity access`); recommendations.push("Expand rural electrification program"); }
    if (elecVal > 95) { topTrends.push("Near-universal access achieved — focus on reliability and affordability"); }
  }

  // Diesel
  const dieselRow = utilRow(allData.diesel_dependence || allData.renewable_penetration || []);
  const dieselMW = dieselRow?.["Diesel MW"];
  const totalMW = dieselRow?.["Total MW"];
  if (typeof dieselMW === "number" && typeof totalMW === "number" && totalMW > 0) {
    const pct = Math.round((dieselMW / totalMW) * 100);
    keyNumbers.push({ label: "Diesel Dependence", value: `${pct}%`, trend: pct > 50 ? "down" : "up", context: pct > 50 ? "High fuel cost exposure" : "Good diversification" });
    if (pct > 70) { redFlags.push(`${pct}% diesel dependence creates severe fuel price vulnerability`); recommendations.push("Accelerate renewable energy integration"); }
  }

  const oneLiners: Record<string, string> = {
    board: `${utility} is ${redFlags.length > 1 ? "facing challenges" : "performing steadily"} in ${fy}. ${redFlags.length > 0 ? redFlags[0] : "No critical concerns."}`,
    donor: `${utility} requires support in ${redFlags.map((f) => f.split(" ")[0]).join(", ")}. Investment would address ${redFlags.length} key performance gaps.`,
    regulator: `${utility} reports ${keyNumbers.map((k) => `${k.label}: ${k.value}`).join(", ")}. ${redFlags.length > 0 ? `${redFlags.length} areas require regulatory attention.` : "All metrics within acceptable ranges."}`,
  };

  return {
    data: {
      utility,
      period: fy,
      key_numbers: keyNumbers.slice(0, 5),
      top_trends: topTrends.slice(0, 3),
      red_flags: redFlags.slice(0, 3),
      recommendations: recommendations.slice(0, 3),
      one_liner: oneLiners[audience] || oneLiners.board,
    },
    metadata: createToolMetadata({ source: "analytics" }),
  };
}

// ═══════════════════════════════════════════════════════
// ONE-CALL AUTO-REPORT
// ═══════════════════════════════════════════════════════

export function assembleFullReport(
  utility: string,
  fy: string,
  allData: Record<string, Record<string, unknown>[]>,
): AiToolResult<{
  briefing: ExecutiveBriefing;
  risks: Record<string, unknown> | null;
  peer_group: Record<string, unknown> | null;
  message: string;
}> {
  const briefing = generateExecutiveBriefing(utility, fy, allData, { audience: "board" }).data!;
  const risks = allData.vulnerability ? allData.vulnerability : null;
  const peerGroup = allData.peer_groups ? allData.peer_groups : null;

  return {
    data: {
      briefing,
      risks: risks ? { data_available: true, rows: risks.length } : { data_available: false },
      peer_group: peerGroup ? { data_available: true } : { data_available: false },
      message: `Complete report assembled for ${utility} in ${fy}. ${briefing.red_flags.length} red flags identified.`,
    },
    metadata: createToolMetadata({ source: "analytics" }),
  };
}

// ═══════════════════════════════════════════════════════
// DATA COMPLETENESS SCORING
// ═══════════════════════════════════════════════════════

export interface CompletenessScore {
  utility: string;
  overall_grade: string;  // A through F
  total_kpis_expected: number;
  kpis_submitted: number;
  completion_pct: number;
  missing_categories: string[];
  recommendation: string;
}

export function scoreDataCompleteness(
  rows: Record<string, unknown>[],
): AiToolResult<{ scores: CompletenessScore[]; summary: string }> {
  const categories = ["SAIDI", "SAIFI", "Losses %", "Recovery %", "Electrification %", "Diesel MW", "Total MW", "Customers"];
  const scores: CompletenessScore[] = [];

  const byUtility = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const utility = (row.Utility || row.Utility) as string;
    if (!utility) continue;
    byUtility.set(utility, row);
  }

  for (const [utility, row] of byUtility) {
    let present = 0;
    const missing: string[] = [];
    for (const cat of categories) {
      const val = row[cat];
      if (val === null || val === undefined || (typeof val === "number" && isNaN(val)) || val === 0) {
        missing.push(cat);
      } else {
        present++;
      }
    }

    const pct = Math.round((present / categories.length) * 100);
    const grade = pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : pct >= 40 ? "D" : "F";

    scores.push({
      utility,
      overall_grade: grade,
      total_kpis_expected: categories.length,
      kpis_submitted: present,
      completion_pct: pct,
      missing_categories: missing,
      recommendation: grade === "A" ? "Excellent — maintain current reporting discipline" :
                      grade === "B" ? `Submit data for: ${missing.join(", ")}` :
                      grade === "F" || grade === "D" ? `Critical — ${present}/${categories.length} KPIs submitted. Missing: ${missing.join(", ")}. Prioritize data entry immediately.` :
                      `Improve reporting for: ${missing.join(", ")}`,
    });
  }

  scores.sort((a, b) => a.completion_pct - b.completion_pct);

  const aPlus = scores.filter((s) => s.overall_grade === "A" || s.overall_grade === "B").length;
  const failing = scores.filter((s) => s.overall_grade === "D" || s.overall_grade === "F").length;
  const summary = `${scores.length} utilities assessed. ${aPlus} are A/B grade, ${failing} need urgent attention (D/F). Most common missing KPI: ${getMostCommonMissing(scores)}.`;

  return { data: { scores, summary }, metadata: createToolMetadata({ source: "analytics" }) };
}

function getMostCommonMissing(scores: CompletenessScore[]): string {
  const counts: Record<string, number> = {};
  for (const s of scores) {
    for (const m of s.missing_categories) {
      counts[m] = (counts[m] || 0) + 1;
    }
  }
  let max = 0; let maxKey = "none";
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) { max = v; maxKey = k; }
  }
  return maxKey;
}

// ═══════════════════════════════════════════════════════
// REGULATORY THRESHOLD TRACKER
// ═══════════════════════════════════════════════════════

export interface RegulatoryViolation {
  utility: string;
  kpi: string;
  current_value: number;
  limit: number;
  exceeded_by_pct: number;
  severity: "critical" | "warning" | "ok";
  regulator_note: string;
}

const REGULATORY_LIMITS: Record<string, { limit: number; direction: "max" | "min"; unit: string; note: string }> = {
  SAIDI: { limit: 500, direction: "max", unit: "minutes", note: "PPA benchmark for acceptable outage duration" },
  "Losses %": { limit: 15, direction: "max", unit: "%", note: "Industry standard for technical + non-technical losses" },
  "Recovery %": { limit: 100, direction: "min", unit: "%", note: "Full cost recovery is the regulatory expectation" },
  LTIFR: { limit: 5, direction: "max", unit: "per million hours", note: "International safety benchmark" },
  "Electrification %": { limit: 90, direction: "min", unit: "%", note: "SDG 7 target: universal access by 2030" },
};

export function trackRegulatoryThresholds(
  rows: Record<string, unknown>[],
): AiToolResult<{ violations: RegulatoryViolation[]; compliance_summary: string }> {
  const violations: RegulatoryViolation[] = [];

  for (const row of rows) {
    const utility = (row.Utility || row.Utility || "unknown") as string;

    for (const [kpi, limit] of Object.entries(REGULATORY_LIMITS)) {
      const val = row[kpi];
      if (typeof val !== "number" || isNaN(val)) continue;

      let exceeded = false;
      let exceededBy = 0;

      if (limit.direction === "max" && val > limit.limit) {
        exceeded = true;
        exceededBy = Math.round(((val - limit.limit) / limit.limit) * 100);
      } else if (limit.direction === "min" && val < limit.limit) {
        exceeded = true;
        exceededBy = Math.round(((limit.limit - val) / limit.limit) * 100);
      }

      if (exceeded) {
        violations.push({
          utility,
          kpi,
          current_value: val,
          limit: limit.limit,
          exceeded_by_pct: exceededBy,
          severity: exceededBy > 50 ? "critical" : "warning",
          regulator_note: limit.note,
        });
      }
    }
  }

  violations.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1));
  const critical = violations.filter((v) => v.severity === "critical").length;
  const summary = `${violations.length} regulatory threshold violations detected. ${critical} are critical (>50% over limit).`;

  return { data: { violations, compliance_summary: summary }, metadata: createToolMetadata({ source: "analytics" }) };
}

// ═══════════════════════════════════════════════════════
// CAPACITY BUILDING RECOMMENDER
// ═══════════════════════════════════════════════════════

export interface CapacityRecommendation {
  utility: string;
  training_area: string;
  priority: "urgent" | "recommended" | "optional";
  reason: string;
}

export function recommendCapacityBuilding(
  workforceRows: Record<string, unknown>[],
  performanceRows: Record<string, unknown>[],
  options: { utility: string },
): AiToolResult<{ recommendations: CapacityRecommendation[]; summary: string }> {
  const utilWorkforce = workforceRows.find((r) => (r.Utility || r.Utility) === options.utility);
  const utilPerf = performanceRows.find((r) => (r.Utility || r.Utility) === options.utility);
  const recommendations: CapacityRecommendation[] = [];

  if (!utilWorkforce) {
    return { data: { recommendations: [], summary: `No workforce data found for ${options.utility}` }, metadata: createToolMetadata({ source: "analytics" }) };
  }

  const totalStaff = typeof utilWorkforce["Total Staff"] === "number" ? utilWorkforce["Total Staff"] : 0;
  const technicalStaff = typeof utilWorkforce["Technical Staff"] === "number" ? utilWorkforce["Technical Staff"] : 0;
  const femaleStaff = typeof utilWorkforce["Female Staff"] === "number" ? utilWorkforce["Female Staff"] : 0;
  const trained = typeof utilWorkforce.Trained === "number" ? utilWorkforce.Trained : 0;
  const femalePct = totalStaff > 0 ? (femaleStaff / totalStaff) * 100 : 0;
  const technicalPct = totalStaff > 0 ? (technicalStaff / totalStaff) * 100 : 0;
  const trainedPct = totalStaff > 0 ? (trained / totalStaff) * 100 : 0;

  // Technical capacity
  if (technicalPct < 30 && totalStaff > 0) {
    recommendations.push({
      utility: options.utility,
      training_area: "Technical Skills Development",
      priority: "urgent",
      reason: `Only ${Math.round(technicalPct)}% of staff are technical — well below the 30% benchmark. Invest in engineering and technician training.`,
    });
  } else if (technicalPct < 50) {
    recommendations.push({
      utility: options.utility,
      training_area: "Technical Upskilling",
      priority: "recommended",
      reason: `Technical staff ratio at ${Math.round(technicalPct)}%. Consider targeted upskilling for non-technical staff.`,
    });
  }

  // Training frequency
  if (trainedPct < 20) {
    recommendations.push({
      utility: options.utility,
      training_area: "Staff Development Program",
      priority: "urgent",
      reason: `Only ${Math.round(trainedPct)}% of staff received training this period. Establish regular training calendar.`,
    });
  }

  // Gender diversity
  if (femalePct < 20 && totalStaff > 0) {
    recommendations.push({
      utility: options.utility,
      training_area: "Gender Inclusion & Women in Energy",
      priority: "recommended",
      reason: `Female participation at ${Math.round(femalePct)}%. Develop scholarship and mentorship programs for women in energy.`,
    });
  }

  // Performance-driven recommendations
  if (utilPerf) {
    const saidi = utilPerf.SAIDI;
    if (typeof saidi === "number" && saidi > 500) {
      recommendations.push({
        utility: options.utility,
        training_area: "Network Operations & Maintenance",
        priority: "urgent",
        reason: `SAIDI of ${saidi} minutes indicates gaps in network O&M. Prioritize line crew training and SCADA operations.`,
      });
    }

    const losses = utilPerf["Losses %"];
    if (typeof losses === "number" && losses > 15) {
      recommendations.push({
        utility: options.utility,
        training_area: "Loss Reduction & Metering",
        priority: "recommended",
        reason: `Losses at ${losses}% suggest training needed in metering, billing, and theft detection.`,
      });
    }

    const recovery = utilPerf["Recovery %"] || utilPerf["Cost Recovery %"];
    if (typeof recovery === "number" && recovery < 80) {
      recommendations.push({
        utility: options.utility,
        training_area: "Financial Management & Tariff Analysis",
        priority: "recommended",
        reason: `Cost recovery at ${recovery}% — financial management and tariff modeling training recommended.`,
      });
    }
  }

  const urgent = recommendations.filter((r) => r.priority === "urgent").length;
  const summary = `${recommendations.length} training recommendations for ${options.utility}. ${urgent} are urgent.`;

  return { data: { recommendations, summary }, metadata: createToolMetadata({ source: "analytics" }) };
}

// ═══════════════════════════════════════════════════════
// TARIFF IMPACT SIMULATION
// ═══════════════════════════════════════════════════════

export interface TariffSimulation {
  utility: string;
  scenario: string;
  current_rate: number;
  new_rate: number;
  customers_affected: number;
  revenue_change: string;
  affordability_impact: string;
}

export function simulateTariffChange(
  tariffRows: Record<string, unknown>[],
  customerRows: Record<string, unknown>[],
  options: { change_pct: number; customer_category?: string; utility?: string },
): AiToolResult<{ simulations: TariffSimulation[]; summary: string }> {
  const simulations: TariffSimulation[] = [];
  const changePct = options.change_pct / 100;

  const utilCustomers = customerRows.find((r) => (r.Utility || r.Utility) === options.utility);
  const totalCustomers = utilCustomers && typeof utilCustomers["Total Connections"] === "number" ? utilCustomers["Total Connections"] : 0;
  const gdpPerCapita = utilCustomers && typeof utilCustomers["GDP per Capita"] === "number" ? utilCustomers["GDP per Capita"] : 1000;

  for (const row of tariffRows) {
    const utility = (row.Utility || row.Utility) as string;
    if (options.utility && utility !== options.utility) continue;
    const category = (row["Customer Category"] || "All") as string;
    if (options.customer_category && category !== options.customer_category) continue;

    const currentRate = typeof row["Tariff Rate (per kWh)"] === "number" ? row["Tariff Rate (per kWh)"] : 0;
    if (currentRate === 0) continue;

    const newRate = Math.round(currentRate * (1 + changePct) * 100) / 100;
    const revenueChange = changePct > 0 ? `+${Math.round(changePct * 100)}%` : `${Math.round(changePct * 100)}%`;
    const affordabilityRatio = (newRate * 100 * 12) / gdpPerCapita; // Rough annual bill / GDP per capita
    const affordability = affordabilityRatio > 0.05
      ? "⚠️ May significantly impact low-income customers"
      : affordabilityRatio > 0.02
        ? "Moderate impact — consider lifeline tariff protection"
        : "Minimal impact on household budgets";

    simulations.push({
      utility,
      scenario: `${changePct > 0 ? "Increase" : "Decrease"} ${category} tariff by ${Math.abs(options.change_pct)}%`,
      current_rate: currentRate,
      new_rate: newRate,
      customers_affected: totalCustomers,
      revenue_change: revenueChange,
      affordability_impact: affordability,
    });
  }

  const summary = `${simulations.length} tariff scenarios simulated. ${changePct > 0 ? `Raising tariffs ${options.change_pct}% would` : `Reducing tariffs ${Math.abs(options.change_pct)}% would`} affect ${simulations.length} utility/category combinations. Use with actual customer segment data for precise impact analysis.`;

  return { data: { simulations, summary }, metadata: createToolMetadata({ source: "analytics" }) };
}

// ═══════════════════════════════════════════════════════
// AUTO-FILL DONOR APPLICATIONS
// ═══════════════════════════════════════════════════════

export function autoFillDonorApplication(
  utility: string,
  fy: string,
  donor: string,
  allData: Record<string, Record<string, unknown>[]>,
): AiToolResult<{ draft: string; sections: Record<string, string>; template_used: string }> {
  const template = DONOR_REPORT_TEMPLATES[donor.toLowerCase()];
  if (!template) {
    return {
      data: { draft: "", sections: {}, template_used: "" },
      metadata: createToolMetadata({ source: "analytics" }),
      error: `Unknown donor: ${donor}. Available: ${Object.keys(DONOR_REPORT_TEMPLATES).join(", ")}`,
    };
  }

  const sections: Record<string, string> = {};
  const utilRow = (d: Record<string, unknown>[]) => d.find((r) => (r.Utility || r.Utility) === utility);

  // Gather key values
  const saidiRow = utilRow(allData.saidi_by_utility || []);
  const lossesRow = utilRow(allData.system_losses || []);
  const finRow = utilRow(allData.cost_recovery || allData.financial_summary || []);
  const custRow = utilRow(allData.customer_overview || []);
  const dieselRow = utilRow(allData.diesel_dependence || allData.renewable_penetration || []);
  const workforceRow = utilRow(allData.workforce_summary || []);

  const saidi = saidiRow?.SAIDI || "N/A";
  const losses = lossesRow?.["Losses %"] || "N/A";
  const recovery = finRow?.["Recovery %"] || finRow?.["Cost Recovery %"] || "N/A";
  const electrification = custRow?.["Electrification %"] || "N/A";
  const customers = custRow?.["Total Connections"] || "N/A";
  const dieselMW = dieselRow?.["Diesel MW"] || 0;
    const totalMW = typeof dieselRow?.["Total MW"] === "number" ? dieselRow["Total MW"] : 1;
    const renewableMW = typeof dieselRow?.["Renewable MW"] === "number" ? dieselRow["Renewable MW"] : 0;
    const dieselPct = typeof dieselMW === "number" && typeof totalMW === "number" ? Math.round((dieselMW / totalMW) * 100) : "N/A";
  const renewablePct = typeof renewableMW === "number" && typeof totalMW === "number" ? Math.round((renewableMW / totalMW) * 100) : "N/A";
  const femaleStaff = workforceRow?.["Female Staff"] || "N/A";
  const totalStaff = workforceRow?.["Total Staff"] || 1;
  const femalePct = typeof femaleStaff === "number" && typeof totalStaff === "number" ? Math.round((femaleStaff / totalStaff) * 100) : "N/A";

  sections["Executive Summary"] = `${utility} is a Pacific Island utility serving approximately ${customers} customers. In ${fy}, the utility achieved a SAIDI of ${saidi} minutes, system losses of ${losses}%, and a cost recovery rate of ${recovery}%.`;
  sections["Performance Data"] = `SAIDI: ${saidi} min | Losses: ${losses}% | Recovery: ${recovery}% | Electrification: ${electrification}% | Diesel: ${dieselPct}% | Renewable: ${renewablePct}% | Female Workforce: ${femalePct}%`;
  sections["Justification"] = `This application is supported by verified performance data from the PRISM benchmarking platform. ${utility}'s data demonstrates need in the following areas: ${template.typical_requirements.slice(0, 3).join(", ")}.`;
  sections["Expected Impact"] = `Investment will address ${template.typical_requirements.length} key performance areas, benefiting approximately ${customers} customers across the utility's service territory.`;
  sections["Narrative"] = template.narrative_template
    .replace("{utility}", utility)
    .replace("{fy}", fy)
    .replace("{customers}", String(customers))
    .replace("{saidi}", String(saidi))
    .replace("{losses}", String(losses))
    .replace("{recovery}", String(recovery))
    .replace("{electrification}", String(electrification))
    .replace("{diesel}", String(dieselPct))
    .replace("{renewable}", String(renewablePct))
    .replace("{female}", String(femalePct))
    .replace("{islands}", "multiple")
    .replace("{context}", "Pacific Island")
    .replace("{saidi_trend}", "stable")
    .replace("{unelectrified}", String(typeof electrification === "number" ? Math.round((100 - electrification) / 100 * (typeof customers === "number" ? customers : 1000)) : "N/A"))
    .replace("{governance}", "standard")
    .replace("{efficiency}", "moderate")
    .replace("{viability}", typeof recovery === "number" ? (recovery >= 100 ? "strong" : "needs improvement") : "N/A")
    .replace("{vulnerability}", typeof dieselPct === "number" ? (dieselPct > 70 ? "high" : "moderate") : "N/A")
    .replace("{emissions}", typeof dieselMW === "number" ? String(Math.round(dieselMW * 0.8 * 8760 * (typeof dieselPct === "number" ? dieselPct / 100 : 1) / 1000)) + " tCO2" : "N/A")
    .replace("{displaced}", String(30))
    .replace("{reduction}", String(typeof dieselMW === "number" ? Math.round(dieselMW * 0.8 * 8760 * 0.3 / 1000) : "N/A"))
    .replace("{island_count}", "several")
    .replace("{challenges}", "remote island geography, diesel dependence, and limited technical workforce")
    .replace("{benefit}", "improved reliability, reduced fuel costs, and expanded electricity access")
    .replace("{islands}", "all served islands")
    .replace("{focus}", "sustainable energy and community resilience");

  const draft = Object.entries(sections).map(([k, v]) => `## ${k}\n${v}`).join("\n\n");

  return {
    data: { draft, sections, template_used: template.donor },
    metadata: createToolMetadata({ source: "analytics" }),
  };
}

// ═══════════════════════════════════════════════════════
// IMPACT PROJECTION
// ═══════════════════════════════════════════════════════

export interface ImpactProjection {
  utility: string;
  project_type: string;
  year: number;
  metric: string;
  baseline: number;
  projected: number;
  cumulative_impact: string;
}

export function projectImpact(
  baselineRows: Record<string, unknown>[],
  options: {
    utility: string;
    project_type: "solar" | "battery" | "feeder_upgrade" | "metering" | "tariff_reform";
    project_scale_mw?: number;
    years?: number;
  },
): AiToolResult<{ projections: ImpactProjection[]; summary: string }> {
  const utilRow = baselineRows.find((r) => (r.Utility || r.Utility) === options.utility);
  if (!utilRow) {
    return { data: { projections: [], summary: `No data for ${options.utility}` }, metadata: createToolMetadata({ source: "analytics" }), error: "Utility not found" };
  }

  const years = options.years || 5;
  const projections: ImpactProjection[] = [];
  const scaleMW = options.project_scale_mw || 2;

  const dieselMW = typeof utilRow["Diesel MW"] === "number" ? utilRow["Diesel MW"] : 0;
  const saidi = typeof utilRow.SAIDI === "number" ? utilRow.SAIDI : 0;
  const losses = typeof utilRow["Losses %"] === "number" ? utilRow["Losses %"] : 0;

  switch (options.project_type) {
    case "solar":
      for (let y = 1; y <= years; y++) {
        const displacementPct = Math.min(scaleMW / Math.max(dieselMW, 0.1) * y * 0.25, 0.8);
        const savingsMWh = Math.round(dieselMW * 8760 * displacementPct);
        const savingsPercent = Math.round(displacementPct * 100);
        projections.push({
          utility: options.utility, project_type: "Solar PV Installation", year: y,
          metric: "Diesel Displacement", baseline: dieselMW,
          projected: Math.round(dieselMW * (1 - displacementPct)),
          cumulative_impact: `Year ${y}: ${savingsMWh} MWh displaced (${savingsPercent}% of diesel)`,
        });
      }
      break;

    case "feeder_upgrade":
      const saidiImprovement = 0.2;
      for (let y = 1; y <= years; y++) {
        const newSaidi = Math.round(saidi * Math.pow(1 - saidiImprovement, y));
        projections.push({
          utility: options.utility, project_type: "Feeder Hardening", year: y,
          metric: "SAIDI", baseline: saidi,
          projected: newSaidi,
          cumulative_impact: `Year ${y}: SAIDI reduced from ${saidi} to ${newSaidi} minutes (${Math.round((1 - newSaidi / saidi) * 100)}% improvement)`,
        });
      }
      break;

    case "metering":
      const lossImprovement = 0.15;
      for (let y = 1; y <= years; y++) {
        const newLosses = Math.round(losses * Math.pow(1 - lossImprovement, y) * 10) / 10;
        projections.push({
          utility: options.utility, project_type: "Smart Metering Deployment", year: y,
          metric: "System Losses %", baseline: losses,
          projected: newLosses,
          cumulative_impact: `Year ${y}: Losses reduced from ${losses}% to ${newLosses}% (${Math.round((1 - newLosses / losses) * 100)}% improvement)`,
        });
      }
      break;

    case "tariff_reform":
      const recoveryRow = utilRow["Recovery %"] || utilRow["Cost Recovery %"];
      const recovery = typeof recoveryRow === "number" ? recoveryRow : 80;
      const recoveryImprovement = 0.05;
      for (let y = 1; y <= years; y++) {
        const newRecovery = Math.min(Math.round(recovery * Math.pow(1 + recoveryImprovement, y)), 120);
        projections.push({
          utility: options.utility, project_type: "Tariff Reform", year: y,
          metric: "Cost Recovery %", baseline: recovery,
          projected: newRecovery,
          cumulative_impact: `Year ${y}: Recovery improved from ${recovery}% to ${newRecovery}%`,
        });
      }
      break;

    default:
      return { data: { projections: [], summary: "Unknown project type" }, metadata: createToolMetadata({ source: "analytics" }), error: "Unknown project type" };
  }

  const summary = `${projections.length} impact projections for ${options.utility} over ${years} years. ${options.project_type.replace(/_/g, " ")} scenario.`;

  return { data: { projections, summary }, metadata: createToolMetadata({ source: "analytics" }) };
}
