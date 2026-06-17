import { listReviewKpiRows } from "@/app/data-entry/review-kpi/service";
import { db } from "@/db/connection";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { eq } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { createToolMetadata, resolvePeriodId, getSeverityScore } from "./common";
import type { AiToolResult } from "../types";

export interface PerformanceKpi {
  name: string;
  status: string;
  actual: number | null;
  target: number | null;
  severity: number;
}

export interface PerformanceData {
  review_status_counts: Record<string, number>;
  weakest_kpis: PerformanceKpi[];
  total_kpis_in_scope: number;
}

export const getPerformanceSnapshot = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
  } = {},
): Promise<AiToolResult<PerformanceData>> => {
  const resolvedPeriodId = await resolvePeriodId(user, options);

  if (!resolvedPeriodId) {
    return {
      data: {
        review_status_counts: {},
        weakest_kpis: [],
        total_kpis_in_scope: 0,
      },
      metadata: createToolMetadata({
        completeness_pct: 0,
        source: "review_kpi",
      }),
      error: options.year
        ? `No report period found for year ${options.year}`
        : "No report period found",
    };
  }

  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    const [period] = await db
      .select({ utility_id: reportPeriods.utility_id })
      .from(reportPeriods)
      .where(eq(reportPeriods.id, resolvedPeriodId))
      .limit(1);

    if (!period || period.utility_id !== user.org_id) {
      return {
        data: {
          review_status_counts: {},
          weakest_kpis: [],
          total_kpis_in_scope: 0,
        },
        metadata: createToolMetadata({
          completeness_pct: 0,
          source: "review_kpi",
        }),
        error: "Report period not found",
      };
    }
  }

  const reviewRows = await listReviewKpiRows({
    reportTypeId: null,
    reportPeriodId: resolvedPeriodId,
    kpiCategoryId: null,
    kpiSubcategoryId: null,
    serviceAreaId: null,
  });

  const reviewStatusCounts = reviewRows.reduce(
    (acc, row) => {
      acc[row.result.status] = (acc[row.result.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const weakestKpis: PerformanceKpi[] = reviewRows
    .filter((row) => row.result.status !== "calculated")
    .slice(0, 5)
    .map((row) => ({
      name: row.kpiName ?? `KPI ${row.kpiDefId}`,
      status: row.result.status,
      actual: null,
      target: null,
      severity: getSeverityScore(row.result.status),
    }))
    .sort((a, b) => b.severity - a.severity);

  return {
    data: {
      review_status_counts: reviewStatusCounts,
      weakest_kpis: weakestKpis,
      total_kpis_in_scope: reviewRows.length,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: reviewRows.length > 0 ? 100 : 0,
      source: "review_kpi",
    }),
  };
};
