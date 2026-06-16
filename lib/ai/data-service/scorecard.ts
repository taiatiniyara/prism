import { getScorecardResponse } from "@/app/data-entry/balanced-scorecard/service";
import { db } from "@/db/connection";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { eq } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { createToolMetadata, resolvePeriodId } from "./common";
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
    year?: number | null;
  } = {},
): Promise<AiToolResult<ScorecardData>> => {
  const resolvedPeriodId = await resolvePeriodId(user, options);

  if (!resolvedPeriodId) {
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
        error: "Report period not found",
      };
    }
  }

  try {
    const scorecard = await getScorecardResponse(user, {
      reportPeriodId: resolvedPeriodId,
      reportTypeId: null,
      serviceAreaId: null,
      kpiCategoryId: null,
      kpiSubcategoryId: null,
    }, { includeUnapproved: true, includeAllDefinitions: true });

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
        if (a.status !== b.status) {
          const order: Record<string, number> = { off_track: 0, at_risk: 1, on_track: 2 };
          return (order[a.status ?? ""] ?? 3) - (order[b.status ?? ""] ?? 3);
        }
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

