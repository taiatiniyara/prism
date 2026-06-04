import { listReviewKpiRows } from "@/app/data-entry/review-kpi/service";
import { getScorecardResponse } from "@/app/data-entry/balanced-scorecard/service";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
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
  } = {},
): Promise<AiToolResult<PerformanceData>> => {
  if (!options.report_period_id) {
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
      error: "No report period specified",
    };
  }

  const reviewRows = await listReviewKpiRows({
    reportTypeId: null,
    reportPeriodId: options.report_period_id,
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
      reportPeriodId: options.report_period_id,
      reportTypeId: null,
      serviceAreaId: null,
      kpiCategoryId: null,
      kpiSubcategoryId: null,
    });

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

const getSeverityScore = (status: string | null): number => {
  if (!status) return 0;
  const normalized = status.toLowerCase();
  if (normalized.includes("off")) return 3;
  if (normalized.includes("risk")) return 2;
  if (normalized.includes("track") || normalized.includes("good")) return 1;
  return 0;
};
