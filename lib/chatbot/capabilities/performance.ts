import { getScorecardResponse } from "@/app/data-entry/balanced-scorecard/service";
import { listReviewKpiRows } from "@/app/data-entry/review-kpi/service";
import {
  DEFAULT_REVIEW_KPI_CONTEXT,
  scoreStatusSeverity,
  toFiniteNumberOrNull,
  type CapabilityContext,
  type CapabilityResolution,
} from "./common";

export const buildPerformanceSnapshotContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  if (!ctx.selectedPeriod) {
    return {
      capability: "performance-snapshot",
      contextBlock:
        "PRISM data grounding: no report periods are currently available for this user scope.",
    };
  }

  const reviewRows = await listReviewKpiRows({
    ...DEFAULT_REVIEW_KPI_CONTEXT,
    reportPeriodId: ctx.selectedPeriod.Id,
  });

  const reviewStatusCounts = reviewRows.reduce(
    (acc, row) => {
      acc[row.result.status] = (acc[row.result.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  let scorecardSummaryLines: string[] = [];

  try {
    const scorecard = await getScorecardResponse(ctx.user, {
      reportPeriodId: ctx.selectedPeriod.Id,
      reportTypeId: null,
      serviceAreaId: null,
      kpiCategoryId: null,
      kpiSubcategoryId: null,
    });

    const weakestPerspectives = [...scorecard.snapshot.perspectiveScores]
      .filter((item) => item.weightedScore != null)
      .sort((a, b) => (a.weightedScore ?? 0) - (b.weightedScore ?? 0))
      .slice(0, 2)
      .map(
        (item) =>
          `- ${item.perspectiveLabel}: weightedScore=${item.weightedScore}, onTrack=${item.statusBreakdown.onTrack}, atRisk=${item.statusBreakdown.atRisk}, offTrack=${item.statusBreakdown.offTrack}`,
      );

    const weakestKpis = (scorecard.rows ?? [])
      .map((row) => {
        const actual = toFiniteNumberOrNull(row.actualValue);
        const target = toFiniteNumberOrNull(row.targetValue);
        const hasComparableGap =
          actual != null && target != null && Math.abs(target) > 0.000001;
        const gapRatio =
          hasComparableGap && target != null && actual != null
            ? (actual - target) / Math.abs(target)
            : 0;

        return {
          name: row.kpiName ?? `KPI ${row.kpiDefinitionId}`,
          status: row.status,
          severity: scoreStatusSeverity(row.status),
          gapRatio,
          actual,
          target,
        };
      })
      .sort((a, b) => {
        if (b.severity !== a.severity) {
          return b.severity - a.severity;
        }

        return a.gapRatio - b.gapRatio;
      })
      .slice(0, 3)
      .map((item) => {
        const gapText =
          item.actual != null && item.target != null
            ? `actual=${item.actual}, target=${item.target}`
            : "actual/target unavailable";

        return `- ${item.name}: status=${item.status ?? "unknown"}, ${gapText}`;
      });

    scorecardSummaryLines = [
      `Overall scorecard score: ${scorecard.snapshot.overallScore ?? "N/A"}`,
      `Total scorecard exclusions: ${scorecard.snapshot.excludedSummary.totalExcluded}`,
      "Weakest perspectives:",
      ...(weakestPerspectives.length
        ? weakestPerspectives
        : ["- No weighted perspective scores available."]),
      "Most concerning KPI rows:",
      ...(weakestKpis.length
        ? weakestKpis
        : ["- No KPI rows available in scorecard response."]),
    ];
  } catch {
    scorecardSummaryLines = [
      "Scorecard snapshot unavailable for this request context.",
    ];
  }

  return {
    capability: "performance-snapshot",
    contextBlock: [
      "PRISM data grounding: performance snapshot.",
      `Scope period: ${ctx.selectedPeriod.Period} (${ctx.selectedPeriod.Utility || "N/A"})`,
      `Review KPI rows in scope: ${reviewRows.length}`,
      `Review status counts: ${
        Object.entries(reviewStatusCounts)
          .map(([status, count]) => `${status}=${count}`)
          .join(", ") || "none"
      }`,
      ...scorecardSummaryLines,
    ].join("\n"),
  };
};

export const buildScorecardSnapshotContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  if (!ctx.selectedPeriod) {
    return {
      capability: "scorecard-snapshot",
      contextBlock:
        "PRISM data grounding: scorecard snapshot unavailable because no report periods are in scope.",
    };
  }

  try {
    const scorecard = await getScorecardResponse(ctx.user, {
      reportPeriodId: ctx.selectedPeriod.Id,
      reportTypeId: null,
      serviceAreaId: null,
      kpiCategoryId: null,
      kpiSubcategoryId: null,
    });

    const perspectiveLines = scorecard.snapshot.perspectiveScores.map(
      (item) =>
        `- ${item.perspectiveLabel}: weightedScore=${item.weightedScore ?? "N/A"}, onTrack=${item.statusBreakdown.onTrack}, atRisk=${item.statusBreakdown.atRisk}, offTrack=${item.statusBreakdown.offTrack}, excluded=${item.excludedCount}`,
    );

    const exclusions = Object.entries(
      scorecard.snapshot.excludedSummary.byReason,
    )
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `- ${reason}: ${count}`);

    return {
      capability: "scorecard-snapshot",
      contextBlock: [
        "PRISM data grounding: balanced scorecard snapshot.",
        `Scope period: ${ctx.selectedPeriod.Period}`,
        `Overall score: ${scorecard.snapshot.overallScore ?? "N/A"}`,
        `Total excluded KPI rows: ${scorecard.snapshot.excludedSummary.totalExcluded}`,
        "Perspective breakdown:",
        ...(perspectiveLines.length
          ? perspectiveLines
          : ["- No perspectives available."]),
        "Exclusion reasons:",
        ...(exclusions.length ? exclusions : ["- No exclusions recorded."]),
      ].join("\n"),
    };
  } catch {
    return {
      capability: "scorecard-snapshot",
      contextBlock:
        "PRISM data grounding: scorecard snapshot request failed for current scope.",
    };
  }
};

export const buildReviewKpiDiagnosticsContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  if (!ctx.selectedPeriod) {
    return {
      capability: "review-kpi-diagnostics",
      contextBlock:
        "PRISM data grounding: review KPI diagnostics unavailable because no report periods are in scope.",
    };
  }

  const rows = await listReviewKpiRows({
    ...DEFAULT_REVIEW_KPI_CONTEXT,
    reportPeriodId: ctx.selectedPeriod.Id,
  });

  const byStatus = rows.reduce(
    (acc, row) => {
      acc[row.result.status] = (acc[row.result.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const unresolvedCommentRows = rows
    .filter((row) =>
      row.inputs.some((input) =>
        input.comments.some((comment) => comment.resolved !== true),
      ),
    )
    .slice(0, 5)
    .map((row) => `- ${row.kpiName}: status=${row.result.status}`);

  const missingInputRows = rows
    .filter((row) => row.result.status === "missing-input")
    .slice(0, 5)
    .map((row) => `- ${row.kpiName}`);

  return {
    capability: "review-kpi-diagnostics",
    contextBlock: [
      "PRISM data grounding: review KPI diagnostics.",
      `Scope period: ${ctx.selectedPeriod.Period}`,
      `Rows in scope: ${rows.length}`,
      `Status counts: ${
        Object.entries(byStatus)
          .map(([status, count]) => `${status}=${count}`)
          .join(", ") || "none"
      }`,
      "Missing-input KPI examples:",
      ...(missingInputRows.length
        ? missingInputRows
        : ["- No missing-input KPI rows identified."]),
      "Rows with unresolved comments:",
      ...(unresolvedCommentRows.length
        ? unresolvedCommentRows
        : ["- No unresolved comments identified in sampled rows."]),
    ].join("\n"),
  };
};
