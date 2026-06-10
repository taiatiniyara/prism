import { db } from "@/db/connection";
import { kpi, kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { eq, and, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { GetReportPeriods } from "@/app/data-entry/service";
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
    () => GetReportPeriods(user, { forceAllUtilities: forceAll }),
  );

  const targetPeriodId = options.report_period_id ?? periods[0]?.Id;
  if (!targetPeriodId) {
    return {
      data: { issues: [], summary: { total_kpis_checked: 0, critical: 0, warnings: 0, compliant: 0 }, report_period: null },
      metadata: createToolMetadata({ source: "kpi_limits" }),
      error: "No report period found",
    };
  }

  const rows = await db
    .select({
      kpiName: kpiDefinitions.name,
      actualValue: kpi.actual_value,
      limits: kpiDefinitions.limits,
      utilityName: organisations.acronym,
      periodDate: reportPeriods.report_date,
    })
    .from(kpi)
    .innerJoin(kpiDefinitions, eq(kpi.kpi_def_id, kpiDefinitions.id))
    .innerJoin(reportPeriods, eq(kpi.report_period_id, reportPeriods.id))
    .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .where(
      and(
        eq(kpi.report_period_id, targetPeriodId),
        eq(kpiDefinitions.is_active, true),
        sql`${kpiDefinitions.limits} IS NOT NULL`,
      ),
    )
    .limit(500);

  const issues: ComplianceIssue[] = [];

  for (const row of rows) {
    const val = parseFloat(row.actualValue);
    if (isNaN(val)) continue;

    const limits = (row.limits as Array<{ lower?: number | null; upper?: number | null }> | null)?.[0];
    if (!limits) continue;

    if (val < 0) {
      issues.push({
        kpi_name: row.kpiName,
        utility_name: row.utilityName ?? "N/A",
        period: String(row.periodDate),
        actual_value: row.actualValue,
        limit_lower: limits.lower ?? null,
        limit_upper: limits.upper ?? null,
        status: "negative",
        severity: "critical",
        description: `${row.kpiName} is negative (${row.actualValue}), which violates basic validity.`,
      });
      continue;
    }

    if (limits.lower != null && val < limits.lower) {
      issues.push({
        kpi_name: row.kpiName,
        utility_name: row.utilityName ?? "N/A",
        period: String(row.periodDate),
        actual_value: row.actualValue,
        limit_lower: limits.lower,
        limit_upper: limits.upper ?? null,
        status: "below_minimum",
        severity: "critical",
        description: `${row.kpiName} is ${row.actualValue}, below the regulatory minimum of ${limits.lower}.`,
      });
      continue;
    }

    if (limits.upper != null && val > limits.upper) {
      issues.push({
        kpi_name: row.kpiName,
        utility_name: row.utilityName ?? "N/A",
        period: String(row.periodDate),
        actual_value: row.actualValue,
        limit_lower: limits.lower ?? null,
        limit_upper: limits.upper,
        status: "above_maximum",
        severity: "warning",
        description: `${row.kpiName} is ${row.actualValue}, above the regulatory maximum of ${limits.upper}.`,
      });
      continue;
    }

    issues.push({
      kpi_name: row.kpiName,
      utility_name: row.utilityName ?? "N/A",
      period: String(row.periodDate),
      actual_value: row.actualValue,
      limit_lower: limits.lower ?? null,
      limit_upper: limits.upper ?? null,
      status: "ok",
      severity: "ok",
      description: `${row.kpiName} (${row.actualValue}) is within limits.`,
    });
  }

  const critical = issues.filter((i) => i.severity === "critical").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const compliant = issues.filter((i) => i.severity === "ok").length;

  const match = periods.find((p) => p.Id === targetPeriodId);

  return {
    data: {
      issues: issues.filter((i) => i.severity !== "ok").sort((a, b) =>
        a.severity === "critical" ? -1 : 1,
      ).slice(0, 50),
      summary: { total_kpis_checked: issues.length, critical, warnings, compliant },
      report_period: match?.Period ?? null,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "kpi_limits" }),
  };
};
