import { listReviewKpiRows } from "@/app/data-entry/review-kpi/service";
import { getScorecardResponse } from "@/app/data-entry/balanced-scorecard/service";
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
  scorecard_overall_score: number | null;
  weakest_perspectives: Array<{
    name: string;
    weighted_score: number | null;
  }>;
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
        scorecard_overall_score: null,
        weakest_perspectives: [],
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
          scorecard_overall_score: null,
          weakest_perspectives: [],
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

  let scorecardOverallScore: number | null = null;
  let weakestPerspectives: Array<{ name: string; weighted_score: number | null }> = [];
  let weakestKpis: PerformanceKpi[] = [];

  try {
    const scorecard = await getScorecardResponse(user, {
      reportPeriodId: resolvedPeriodId,
      reportTypeId: null,
      serviceAreaId: null,
      kpiCategoryId: null,
      kpiSubcategoryId: null,
    }, { includeUnapproved: true, includeAllDefinitions: true });

    scorecardOverallScore = scorecard.snapshot.overallScore;

    weakestPerspectives = [...scorecard.snapshot.perspectiveScores]
      .filter((p) => p.weightedScore != null)
      .sort((a, b) => (a.weightedScore ?? 0) - (b.weightedScore ?? 0))
      .slice(0, 3)
      .map((p) => ({
        name: p.perspectiveLabel,
        weighted_score: p.weightedScore,
      }));

    weakestKpis = (scorecard.rows ?? [])
      .map((row) => {
        const actual = typeof row.actualValue === "number" ? row.actualValue : null;
        const target = typeof row.targetValue === "number" ? row.targetValue : null;
        const severity = getSeverityScore(row.status);

        return {
          name: row.kpiName ?? `KPI ${row.kpiDefinitionId}`,
          status: row.status ?? "unknown",
          actual,
          target,
          severity,
        };
      })
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 5);
  } catch {
    weakestPerspectives = [];
    weakestKpis = [];
  }

  return {
    data: {
      review_status_counts: reviewStatusCounts,
      weakest_kpis: weakestKpis,
      scorecard_overall_score: scorecardOverallScore,
      weakest_perspectives: weakestPerspectives,
      total_kpis_in_scope: reviewRows.length,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: reviewRows.length > 0 ? 100 : 0,
      source: "review_kpi_scorecard",
    }),
  };
};

