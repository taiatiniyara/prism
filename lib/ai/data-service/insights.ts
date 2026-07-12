import { getAccessibleReportPeriods } from "./common";
import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface RiskProfile {
  utility_name: string;
  completion_pct: number;
  trend_pp: number;
  pending_rate: number;
  approval_gap: number;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  flags: string[];
}

export interface RiskAssessmentData {
  profiles: RiskProfile[];
  highest_risk: RiskProfile | null;
  summary: { low: number; medium: number; high: number; critical: number };
}

export const getRiskAssessment = async (
  user: CurrentUser,
  options: {
    all_utilities?: boolean;
  } = {},
): Promise<AiToolResult<RiskAssessmentData>> => {
  const periods = await getAccessibleReportPeriods(user, {
    forceAllUtilities: options.all_utilities === true && hasGlobalUtilityAccess(user),
  });

  if (periods.length === 0) {
    return {
      data: { profiles: [], highest_risk: null, summary: { low: 0, medium: 0, high: 0, critical: 0 } },
      metadata: createToolMetadata({ source: "report_periods" }),
      error: "No data available",
    };
  }

  const profiles: RiskProfile[] = periods.map((p) => {
    const completed = p.Entered + p.Reviewed + p.Approved;
    const completion = p.Requested > 0 ? Math.round((completed / p.Requested) * 100) : 0;
    const pendingRate = p.Requested > 0 ? Math.round((p.Pending / p.Requested) * 100) : 0;
    const approvalGap = p.Reviewed > 0 ? p.Reviewed : 0;

    const flags: string[] = [];
    let score = 0;

    if (completion < 50) { score += 30; flags.push("Low completion (<50%)"); }
    else if (completion < 70) { score += 15; flags.push("Moderate completion (<70%)"); }

    if (pendingRate > 60) { score += 25; flags.push("High pending rate (>60%)"); }
    else if (pendingRate > 40) { score += 10; flags.push("Elevated pending rate (>40%)"); }

    if (approvalGap > 20) { score += 25; flags.push(`Large approval gap (${approvalGap} reviewed but not approved)`); }
    else if (approvalGap > 10) { score += 10; flags.push("Approval backlog"); }

    if (p.Approved === 0 && completed > 0) {
      score += 20;
      flags.push("Zero approvals");
    }

    const riskLevel: RiskProfile["risk_level"] =
      score >= 70 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";

    return {
      utility_name: p.Utility || "N/A",
      completion_pct: completion,
      trend_pp: 0,
      pending_rate: pendingRate,
      approval_gap: approvalGap,
      risk_score: score,
      risk_level: riskLevel,
      flags,
    };
  });

  const summary = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const p of profiles) {
    summary[p.risk_level]++;
  }

  const sorted = [...profiles].sort((a, b) => b.risk_score - a.risk_score);

  return {
    data: {
      profiles: sorted,
      highest_risk: sorted[0] ?? null,
      summary,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "report_periods" }),
  };
};

export interface DataQualityIssue {
  kpi_name: string;
  utility_name: string;
  period: string;
  actual_value: number | null;
  expected_range: string;
  issue_type: "negative" | "out_of_range" | "anomalous_jump";
  severity: "high" | "medium";
  description: string;
}

export interface DataQualityData {
  issues: DataQualityIssue[];
  total_issues: number;
  by_type: Record<string, number>;
}

export const getDataQualityReport = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
  } = {},
): Promise<AiToolResult<DataQualityData>> => {
  let query = sql`SELECT kpi_instance_id, kpi_name, actual_value, utility_name, report_date, limits FROM gold.fact_kpi`;

  if (options.report_period_id) {
    query = sql`${query} WHERE report_period_id = ${options.report_period_id}`;
  }

  query = sql`${query} LIMIT 200`;

  const result = await db.execute(query);

  const rows = result.rows as Array<{
    kpi_instance_id: number;
    kpi_name: string;
    actual_value: string | null;
    utility_name: string;
    report_date: string;
    limits: Array<{ lower?: number | null; upper?: number | null }> | null;
  }>;

  const issues: DataQualityIssue[] = [];

  for (const row of rows) {
    const val = row.actual_value ? parseFloat(row.actual_value) : NaN;
    if (isNaN(val)) continue;

    if (val < 0) {
      issues.push({
        kpi_name: row.kpi_name,
        utility_name: row.utility_name,
        period: String(row.report_date),
        actual_value: val,
        expected_range: ">= 0",
        issue_type: "negative",
        severity: "high",
        description: `${row.kpi_name} has a negative value (${val}), which is unusual for utility KPIs.`,
      });
    }

    const limits = row.limits;
    if (limits?.[0]) {
      const { lower: min, upper: max } = limits[0];
      if (min != null && val < min) {
        issues.push({
          kpi_name: row.kpi_name,
          utility_name: row.utility_name,
          period: String(row.report_date),
          actual_value: val,
          expected_range: `${min} - ${max ?? "∞"}`,
          issue_type: "out_of_range",
          severity: "medium",
          description: `${row.kpi_name} value ${val} is below minimum ${min}.`,
        });
      }
      if (max != null && val > max) {
        issues.push({
          kpi_name: row.kpi_name,
          utility_name: row.utility_name,
          period: String(row.report_date),
          actual_value: val,
          expected_range: `${min ?? "0"} - ${max}`,
          issue_type: "out_of_range",
          severity: "medium",
          description: `${row.kpi_name} value ${val} exceeds maximum ${max}.`,
        });
      }
    }
  }

  const byType: Record<string, number> = {};
  for (const issue of issues) {
    byType[issue.issue_type] = (byType[issue.issue_type] ?? 0) + 1;
  }

  return {
    data: {
      issues: issues.slice(0, 50),
      total_issues: issues.length,
      by_type: byType,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "kpi_values" }),
  };
};

export interface WhatChangedItem {
  kpi_name: string;
  utility_name: string;
  period_a: string;
  period_b: string;
  value_a: number | null;
  value_b: number | null;
  change_pct: number;
  magnitude: "major" | "moderate" | "minor";
}

export interface WhatChangedData {
  items: WhatChangedItem[];
  period_a: string | null;
  period_b: string | null;
}

export const getWhatChanged = async (
  user: CurrentUser,
  _options: {
    report_period_id?: number | null;
    year?: number | null;
  } = {},
): Promise<AiToolResult<WhatChangedData>> => {
  const periods = await getAccessibleReportPeriods(user, { forceAllUtilities: false });
  if (periods.length < 2) {
    return {
      data: { items: [], period_a: null, period_b: null },
      metadata: createToolMetadata({ source: "report_periods+kpi" }),
      error: "Need at least 2 periods for change detection",
    };
  }

  const latest = periods[0];
  const previous = periods[1];

  const result = await db.execute(sql`
    SELECT kpi_name, actual_value, report_period_id
    FROM gold.fact_kpi
    WHERE report_period_id IN (${latest.Id}, ${previous.Id})
  `);

  const rows = result.rows as Array<{
    kpi_name: string;
    actual_value: string | null;
    report_period_id: number;
  }>;

  const byName = new Map<string, { current?: number; previous?: number }>();
  for (const row of rows) {
    const entry = byName.get(row.kpi_name) ?? {};
    if (row.report_period_id === latest.Id) entry.current = row.actual_value ? parseFloat(row.actual_value) : undefined;
    if (row.report_period_id === previous.Id) entry.previous = row.actual_value ? parseFloat(row.actual_value) : undefined;
    byName.set(row.kpi_name, entry);
  }

  const items: WhatChangedItem[] = [];
  for (const [name, vals] of byName) {
    if (vals.current == null || vals.previous == null || isNaN(vals.current) || isNaN(vals.previous)) continue;
    if (vals.previous === 0 && vals.current === 0) continue;
    const changePct = vals.previous !== 0
      ? Math.round(((vals.current - vals.previous) / Math.abs(vals.previous)) * 100)
      : vals.current > 0 ? 100 : 0;
    const absChange = Math.abs(changePct);
    const magnitude: WhatChangedItem["magnitude"] =
      absChange >= 50 ? "major" : absChange >= 20 ? "moderate" : "minor";

    items.push({
      kpi_name: name,
      utility_name: latest.Utility || "N/A",
      period_a: previous.Period,
      period_b: latest.Period,
      value_a: vals.previous,
      value_b: vals.current,
      change_pct: changePct,
      magnitude,
    });
  }

  items.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));

  return {
    data: {
      items: items.slice(0, 30),
      period_a: previous.Period,
      period_b: latest.Period,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "kpi_values" }),
  };
};
