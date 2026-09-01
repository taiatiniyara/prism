import { db } from "@/db/connection";
import { sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { getAccessibleReportPeriods } from "./common";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";
import { withCache } from "../cache";

export interface ComplianceIssue {
  kpi_name: string;
  utility_name: string;
  period: string;
  actual_value: string;
  limit_lower: number | null;
  limit_upper: number | null;
  status: "below_minimum" | "above_maximum" | "negative" | "ok";
  severity: "critical" | "warning" | "ok";
  description: string;
}

export interface ComplianceData {
  issues: ComplianceIssue[];
  summary: {
    total_kpis_checked: number;
    critical: number;
    warnings: number;
    compliant: number;
  };
  report_period: string | null;
}

export const getComplianceStatus = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
    all_utilities?: boolean;
  } = {},
): Promise<AiToolResult<ComplianceData>> => {
  const forceAll = options.all_utilities === true && hasGlobalUtilityAccess(user);

  const periods = await withCache(
    `report_periods:${forceAll}:${user.id}`,
    () => getAccessibleReportPeriods(user, { forceAllUtilities: forceAll }),
  );

  const targetPeriodId = options.report_period_id ?? periods[0]?.Id;
  if (!targetPeriodId) {
    return {
      data: { issues: [], summary: { total_kpis_checked: 0, critical: 0, warnings: 0, compliant: 0 }, report_period: null },
      metadata: createToolMetadata({ source: "kpi_limits" }),
      error: "No report period found",
    };
  }

  const result = await db.execute(sql`
    SELECT kpi_name, actual_value, limits, utility_name, report_date
    FROM gold.fact_kpi
    WHERE report_period_id = ${targetPeriodId}
      AND limits IS NOT NULL
    LIMIT 500
  `);

  const rows = result.rows as Array<{
    kpi_name: string;
    actual_value: string | null;
    limits: Array<{ lower?: number | null; upper?: number | null }> | null;
    utility_name: string;
    report_date: string;
  }>;

  const issues: ComplianceIssue[] = [];

  for (const row of rows) {
    const val = row.actual_value ? parseFloat(row.actual_value) : NaN;
    if (isNaN(val)) continue;

    const limits = row.limits?.[0];
    if (!limits) continue;

    if (val < 0) {
      issues.push({
        kpi_name: row.kpi_name,
        utility_name: row.utility_name ?? "N/A",
        period: String(row.report_date),
        actual_value: row.actual_value ?? "N/A",
        limit_lower: limits.lower ?? null,
        limit_upper: limits.upper ?? null,
        status: "negative",
        severity: "critical",
        description: `${row.kpi_name} is negative (${row.actual_value}), which violates basic validity.`,
      });
      continue;
    }

    if (limits.lower != null && val < limits.lower) {
      issues.push({
        kpi_name: row.kpi_name,
        utility_name: row.utility_name ?? "N/A",
        period: String(row.report_date),
        actual_value: row.actual_value ?? "N/A",
        limit_lower: limits.lower,
        limit_upper: limits.upper ?? null,
        status: "below_minimum",
        severity: "critical",
        description: `${row.kpi_name} is ${row.actual_value}, below the regulatory minimum of ${limits.lower}.`,
      });
      continue;
    }

    if (limits.upper != null && val > limits.upper) {
      issues.push({
        kpi_name: row.kpi_name,
        utility_name: row.utility_name ?? "N/A",
        period: String(row.report_date),
        actual_value: row.actual_value ?? "N/A",
        limit_lower: limits.lower ?? null,
        limit_upper: limits.upper,
        status: "above_maximum",
        severity: "warning",
        description: `${row.kpi_name} is ${row.actual_value}, above the regulatory maximum of ${limits.upper}.`,
      });
      continue;
    }

    issues.push({
      kpi_name: row.kpi_name,
      utility_name: row.utility_name ?? "N/A",
      period: String(row.report_date),
      actual_value: row.actual_value ?? "N/A",
      limit_lower: limits.lower ?? null,
      limit_upper: limits.upper ?? null,
      status: "ok",
      severity: "ok",
      description: `${row.kpi_name} (${row.actual_value}) is within limits.`,
    });
  }

  const critical = issues.filter((i) => i.severity === "critical").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const compliant = issues.filter((i) => i.severity === "ok").length;

  const match = periods.find((p) => p.Id === targetPeriodId);

  return {
    data: {
      issues: issues.filter((i) => i.severity !== "ok").sort((a, b) => {
        if (a.severity === b.severity) return 0;
        return a.severity === "critical" ? -1 : 1;
      }).slice(0, 50),
      summary: { total_kpis_checked: issues.length, critical, warnings, compliant },
      report_period: match?.Period ?? null,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "kpi_limits" }),
  };
};
