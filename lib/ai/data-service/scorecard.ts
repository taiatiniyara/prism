import { getScorecardResponse } from "@/app/data-entry/balanced-scorecard/service";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface ScorecardPerspective {
  name: string;
  weighted_score: number | null;
  on_track: number;
  at_risk: number;
  off_track: number;
  excluded: number;
}

export interface ScorecardKpi {
  name: string;
  status: string | null;
  actual: number | null;
  target: number | null;
  gap_ratio: number;
}

export interface ScorecardData {
  overall_score: number | null;
  total_excluded: number;
  perspectives: ScorecardPerspective[];
  weakest_kpis: ScorecardKpi[];
  exclusion_reasons: Array<{ reason: string; count: number }>;
  report_period: string | null;
}

export const getScorecardSummary = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
  } = {},
): Promise<AiToolResult<ScorecardData>> => {
  if (!options.report_period_id) {
    return {
      data: {
        overall_score: null,
        total_excluded: 0,
        perspectives: [],
        weakest_kpis: [],
        exclusion_reasons: [],
        report_period: null,
      },
      metadata: createToolMetadata({
        completeness_pct: 0,
        source: "scorecard",
      }),
      error: "No report period specified",
    };
  }

  try {
    const scorecard = await getScorecardResponse(user, {
      reportPeriodId: options.report_period_id,
      reportTypeId: null,
      serviceAreaId: null,
      kpiCategoryId: null,
      kpiSubcategoryId: null,
    });

    const perspectives: ScorecardPerspective[] =
      scorecard.snapshot.perspectiveScores.map((p) => ({
        name: p.perspectiveLabel,
        weighted_score: p.weightedScore,
        on_track: p.statusBreakdown.onTrack,
        at_risk: p.statusBreakdown.atRisk,
        off_track: p.statusBreakdown.offTrack,
        excluded: p.excludedCount,
      }));

    const exclusionReasons = Object.entries(
      scorecard.snapshot.excludedSummary.byReason,
    )
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    const weakestKpis: ScorecardKpi[] = (scorecard.rows ?? [])
      .map((row) => {
        const actual =
          typeof row.actualValue === "number" ? row.actualValue : null;
        const target =
          typeof row.targetValue === "number" ? row.targetValue : null;
        const gapRatio =
          actual != null && target != null && Math.abs(target) > 0.000001
            ? (actual - target) / Math.abs(target)
            : 0;

        return {
          name: row.kpiName ?? `KPI ${row.kpiDefinitionId}`,
          status: row.status,
          actual,
          target,
          gap_ratio: gapRatio,
        };
      })
      .sort((a, b) => {
        const severityA = getSeverityScore(a.status);
        const severityB = getSeverityScore(b.status);
        if (severityB !== severityA) return severityB - severityA;
        return a.gap_ratio - b.gap_ratio;
      })
      .slice(0, 5);

    return {
      data: {
        overall_score: scorecard.snapshot.overallScore,
        total_excluded: scorecard.snapshot.excludedSummary.totalExcluded,
        perspectives,
        weakest_kpis: weakestKpis,
        exclusion_reasons: exclusionReasons,
        report_period: null,
      },
      metadata: createToolMetadata({
        freshness: new Date(),
        completeness_pct: perspectives.length > 0 ? 100 : 0,
        source: "scorecard",
      }),
    };
  } catch {
    return {
      data: {
        overall_score: null,
        total_excluded: 0,
        perspectives: [],
        weakest_kpis: [],
        exclusion_reasons: [],
        report_period: null,
      },
      metadata: createToolMetadata({
        completeness_pct: 0,
        source: "scorecard",
      }),
      error: "Failed to fetch scorecard data",
    };
  }
};

const getSeverityScore = (status: string | null): number => {
  if (!status) return 0;
  const normalized = status.toLowerCase();
  if (normalized.includes("off")) return 3;
  if (normalized.includes("risk")) return 2;
  if (normalized.includes("track") || normalized.includes("good")) return 1;
  return 0;
};
