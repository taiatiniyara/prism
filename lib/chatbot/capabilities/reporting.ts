import { getReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/service";
import {
  DEFAULT_REVIEW_KPI_CONTEXT,
  resolveRecommendedView,
  toPercent,
  type CapabilityContext,
  type CapabilityResolution,
} from "./common";

export const buildReportPeriodOverviewContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const sourcePeriods = ctx.scopedPeriods;
  const multiPeriodWindow = sourcePeriods.slice(0, 12);

  const aggregate = sourcePeriods.reduce(
    (acc, item) => {
      acc.requested += item.Requested;
      acc.pending += item.Pending;
      acc.entered += item.Entered;
      acc.reviewed += item.Reviewed;
      acc.approved += item.Approved;
      acc.endorsed += item.Endorsed;
      acc.notAvailable += item.Not_Available;
      return acc;
    },
    {
      requested: 0,
      pending: 0,
      entered: 0,
      reviewed: 0,
      approved: 0,
      endorsed: 0,
      notAvailable: 0,
    },
  );

  const lines = multiPeriodWindow.map((row) => {
    return `- ${row.Period} (${row.Utility || "N/A"}): Requested=${row.Requested}, Pending=${row.Pending}, Entered=${row.Entered}, Reviewed=${row.Reviewed}, Approved=${row.Approved}, Endorsed=${row.Endorsed}, Not_Available=${row.Not_Available}`;
  });

  const completionLines = multiPeriodWindow.map((row) => {
    const completionCount =
      row.Entered + row.Reviewed + row.Approved + row.Endorsed;
    const completionRate =
      row.Requested > 0
        ? Math.round((completionCount / row.Requested) * 100)
        : 0;

    return `- ${row.Period}: completion=${completionRate}% (${completionCount}/${row.Requested}), pending=${row.Pending}, not_available=${row.Not_Available}`;
  });

  return {
    capability: "report-period-overview",
    contextBlock: [
      "PRISM data grounding: report period and submission snapshot.",
      "Available dimensions: period, utility.",
      "Unavailable dimensions in this grounding: kpi-category, kpi-subcategory, service-area, individual-kpi, balanced-scorecard-perspective. Do not produce breakdowns by these dimensions from this block; if asked, state the dimension is not in the supplied data and recommend the relevant PRISM workflow without inventing UI labels.",
      `Scope mode: ${ctx.allUtilitiesRequested ? "all-utilities" : "default utility"}`,
      `Default utility: ${ctx.defaultUtility ?? "unknown"}`,
      `Total periods in scope: ${sourcePeriods.length}`,
      `Aggregate requested entries: ${aggregate.requested}`,
      `Aggregate pending entries: ${aggregate.pending} (${toPercent(aggregate.pending, aggregate.requested)})`,
      `Aggregate entered entries: ${aggregate.entered} (${toPercent(aggregate.entered, aggregate.requested)})`,
      `Aggregate reviewed entries: ${aggregate.reviewed} (${toPercent(aggregate.reviewed, aggregate.requested)})`,
      `Aggregate approved entries: ${aggregate.approved} (${toPercent(aggregate.approved, aggregate.requested)})`,
      `Aggregate endorsed entries: ${aggregate.endorsed} (${toPercent(aggregate.endorsed, aggregate.requested)})`,
      `Aggregate not-available entries: ${aggregate.notAvailable} (${toPercent(aggregate.notAvailable, aggregate.requested)})`,
      `Multi-period window size: ${multiPeriodWindow.length}`,
      "KPI status values across report periods:",
      ...completionLines,
      "Detailed report periods:",
      ...lines,
    ].join("\n"),
  };
};

export const buildAnomalyInsightsContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const sourcePeriods = ctx.allUtilitiesRequested
    ? ctx.periods
    : ctx.scopedPeriods;

  const utilitySeries = new Map<
    string,
    Array<{
      period: string;
      completionRate: number;
      pendingRate: number;
      notAvailableRate: number;
      pending: number;
      requested: number;
    }>
  >();

  for (const row of sourcePeriods.slice(0, 24)) {
    const utility = row.Utility || "N/A";
    const requested = row.Requested;
    const completionCount =
      row.Entered + row.Reviewed + row.Approved + row.Endorsed;
    const completionRate = requested > 0 ? completionCount / requested : 0;
    const pendingRate = requested > 0 ? row.Pending / requested : 0;
    const notAvailableRate = requested > 0 ? row.Not_Available / requested : 0;

    const existing = utilitySeries.get(utility) ?? [];
    existing.push({
      period: row.Period,
      completionRate,
      pendingRate,
      notAvailableRate,
      pending: row.Pending,
      requested,
    });
    utilitySeries.set(utility, existing);
  }

  const anomalies: string[] = [];

  for (const [utility, records] of utilitySeries.entries()) {
    if (records.length < 2) {
      continue;
    }

    const latest = records[0];
    const previous = records[1];
    const completionDrop = Math.round(
      (latest.completionRate - previous.completionRate) * 100,
    );
    const pendingJump = Math.round(
      (latest.pendingRate - previous.pendingRate) * 100,
    );
    const notAvailableJump = Math.round(
      (latest.notAvailableRate - previous.notAvailableRate) * 100,
    );

    if (completionDrop <= -10) {
      anomalies.push(
        `- ${utility}: completion dropped ${Math.abs(completionDrop)}pp (${previous.period} -> ${latest.period}).`,
      );
    }

    if (pendingJump >= 10) {
      anomalies.push(
        `- ${utility}: pending rate increased ${pendingJump}pp (${previous.period} -> ${latest.period}).`,
      );
    }

    if (notAvailableJump >= 5) {
      anomalies.push(
        `- ${utility}: not-available rate increased ${notAvailableJump}pp (${previous.period} -> ${latest.period}).`,
      );
    }
  }

  const watchlist = sourcePeriods
    .map((row) => ({
      utility: row.Utility || "N/A",
      period: row.Period,
      pending: row.Pending,
      requested: row.Requested,
      pendingRate:
        row.Requested > 0 ? Math.round((row.Pending / row.Requested) * 100) : 0,
    }))
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 5)
    .map(
      (row) =>
        `- ${row.utility} (${row.period}): pending=${row.pending}/${row.requested} (${row.pendingRate}%).`,
    );

  return {
    capability: "anomaly-insights",
    contextBlock: [
      "PRISM data grounding: anomaly and change-digest signals from report-period submission patterns.",
      "Available dimensions: period, utility.",
      "Unavailable dimensions in this grounding: kpi-category, kpi-subcategory, service-area, individual-kpi.",
      `Scope mode: ${ctx.allUtilitiesRequested ? "all-utilities" : "default utility"}`,
      "Detected anomalies:",
      ...(anomalies.length
        ? anomalies.slice(0, 8)
        : [
            "- No high-severity anomaly was detected using configured delta thresholds.",
          ]),
      "Current pending watchlist (highest pending counts):",
      ...(watchlist.length
        ? watchlist
        : ["- No watchlist records available in current scope."]),
      "Threshold policy used: completion drop >=10pp, pending increase >=10pp, not-available increase >=5pp period-over-period.",
    ].join("\n"),
  };
};

export const buildBenchmarkingSnapshotContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const sourcePeriods = ctx.allUtilitiesRequested
    ? ctx.periods
    : ctx.scopedPeriods;

  const rankedRecords = [...sourcePeriods]
    .map((period) => {
      const completionRate =
        period.Requested > 0
          ? (period.Entered +
              period.Reviewed +
              period.Approved +
              period.Endorsed) /
            period.Requested
          : 0;
      return {
        utility: period.Utility || "N/A",
        period: period.Period,
        completionRate,
        pending: period.Pending,
        requested: period.Requested,
      };
    })
    .sort((a, b) => b.completionRate - a.completionRate);

  const ranked = rankedRecords
    .slice(0, 5)
    .map(
      (item) =>
        `- ${item.utility} (${item.period}): completion=${Math.round(item.completionRate * 100)}%, pending=${item.pending}, requested=${item.requested}`,
    );

  const comparisonTableRows = rankedRecords.slice(0, 20).map((item) => {
    return `- period=${item.period}; utility=${item.utility}; completion_pct=${Math.round(item.completionRate * 100)}; pending=${item.pending}; requested=${item.requested}`;
  });

  let utilityVsPeersLines: string[] = [];

  if (ctx.defaultUtility && rankedRecords.length > 0) {
    const defaultUtilityRecords = rankedRecords.filter(
      (item) => item.utility === ctx.defaultUtility,
    );

    const selectedPeriodRecord = ctx.selectedPeriod
      ? defaultUtilityRecords.find(
          (item) => item.period === ctx.selectedPeriod?.Period,
        )
      : null;

    const referenceRecord =
      selectedPeriodRecord ??
      defaultUtilityRecords.find(
        (item) => item.period === rankedRecords[0]?.period,
      ) ??
      defaultUtilityRecords[0] ??
      null;

    if (referenceRecord) {
      const peerRecords = rankedRecords.filter(
        (item) =>
          item.period === referenceRecord.period &&
          item.utility !== ctx.defaultUtility,
      );

      const peerAverage =
        peerRecords.length > 0
          ? peerRecords.reduce((acc, item) => acc + item.completionRate, 0) /
            peerRecords.length
          : null;

      const periodRanking = rankedRecords
        .filter((item) => item.period === referenceRecord.period)
        .sort((a, b) => b.completionRate - a.completionRate);

      const utilityRank =
        periodRanking.findIndex((item) => item.utility === ctx.defaultUtility) +
        1;

      const gapToPeerAverage =
        peerAverage == null
          ? null
          : Math.round((referenceRecord.completionRate - peerAverage) * 100);

      utilityVsPeersLines = [
        `- Reference utility: ${ctx.defaultUtility}`,
        `- Reference period: ${referenceRecord.period}`,
        `- ${ctx.defaultUtility} completion: ${Math.round(referenceRecord.completionRate * 100)}%`,
        peerAverage == null
          ? "- Peer average completion: N/A (no comparable peer records in the same period)."
          : `- Peer average completion: ${Math.round(peerAverage * 100)}% (gap=${gapToPeerAverage}pp)`,
        `- Rank in period: ${utilityRank}/${periodRanking.length}`,
      ];
    }
  }

  return {
    capability: "benchmarking-snapshot",
    contextBlock: [
      "PRISM data grounding: cross-utility/report-period benchmarking snapshot from submission performance.",
      "Available dimensions: period, utility, completion%.",
      "Unavailable dimensions in this grounding: kpi-category, kpi-subcategory, service-area, individual-kpi-value, balanced-scorecard-perspective.",
      `Scope mode: ${ctx.allUtilitiesRequested ? "all-utilities" : "default utility"}`,
      ...(utilityVsPeersLines.length
        ? ["Default utility vs peers:", ...utilityVsPeersLines]
        : []),
      "Structured comparison rows (table-ready):",
      ...(comparisonTableRows.length
        ? comparisonTableRows
        : ["- No table rows available in current scope."]),
      "Top completion records in scope:",
      ...(ranked.length ? ranked : ["- No benchmarkable records in scope."]),
      "Important limitation: this benchmark is based on submission/completion indicators at report-period level, not full KPI-definition-level peer values.",
    ].join("\n"),
  };
};

export const buildTrendSnapshotContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const sourcePeriods = ctx.allUtilitiesRequested
    ? ctx.periods
    : ctx.scopedPeriods;
  const byUtility = new Map<
    string,
    {
      first: (typeof ctx.periods)[number];
      latest: (typeof ctx.periods)[number];
    }
  >();

  for (const period of [...sourcePeriods].reverse()) {
    const key = period.Utility || "N/A";
    const current = byUtility.get(key);
    if (!current) {
      byUtility.set(key, { first: period, latest: period });
      continue;
    }

    byUtility.set(key, { first: current.first, latest: period });
  }

  const trendLines = [...byUtility.entries()]
    .map(([utility, pair]) => {
      const firstRate =
        pair.first.Requested > 0
          ? (pair.first.Entered +
              pair.first.Reviewed +
              pair.first.Approved +
              pair.first.Endorsed) /
            pair.first.Requested
          : 0;

      const latestRate =
        pair.latest.Requested > 0
          ? (pair.latest.Entered +
              pair.latest.Reviewed +
              pair.latest.Approved +
              pair.latest.Endorsed) /
            pair.latest.Requested
          : 0;

      const delta = Math.round((latestRate - firstRate) * 100);
      return {
        utility,
        line: `- ${utility}: first=${Math.round(firstRate * 100)}%, latest=${Math.round(latestRate * 100)}%, delta=${delta}pp`,
      };
    })
    .sort((a, b) => b.line.localeCompare(a.line))
    .slice(0, 5)
    .map((item) => item.line);

  return {
    capability: "trend-snapshot",
    contextBlock: [
      "PRISM data grounding: trend snapshot based on first-vs-latest completion rates per utility.",
      "Available dimensions: period, utility, completion-rate-delta.",
      "Unavailable dimensions in this grounding: kpi-category, individual-kpi, service-area.",
      `Scope mode: ${ctx.allUtilitiesRequested ? "all-utilities" : "default utility"}`,
      ...(trendLines.length
        ? trendLines
        : ["- Insufficient records to compute utility trends."]),
    ].join("\n"),
  };
};

export const buildGovernanceAuditSnapshotContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const sourcePeriods = ctx.scopedPeriods;
  const byPendingWith = sourcePeriods.reduce(
    (acc, period) => {
      const key = period.Pending_With || "Unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const ownershipLines = Object.entries(byPendingWith)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([owner, count]) => `- ${owner}: ${count} periods`);

  const recentUpdates = sourcePeriods
    .slice(0, 5)
    .map(
      (period) =>
        `- ${period.Period} (${period.Utility || "N/A"}): updated=${period.Updated}, pending_with=${period.Pending_With || "Unknown"}`,
    );

  return {
    capability: "governance-audit-snapshot",
    contextBlock: [
      "PRISM data grounding: governance and accountability snapshot.",
      "Available dimensions: period, utility, approval-state counts.",
      "Unavailable dimensions in this grounding: individual-reviewer-name, comment-text, kpi-category.",
      `Scope mode: ${ctx.allUtilitiesRequested ? "all-utilities" : "default utility"}`,
      "Pending ownership distribution:",
      ...(ownershipLines.length
        ? ownershipLines
        : ["- No pending ownership information available."]),
      "Recent update trace:",
      ...recentUpdates,
    ].join("\n"),
  };
};

export const buildConfigurationSetupSnapshotContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const options = await getReviewKpiFilterOptions(ctx.user, {
    ...DEFAULT_REVIEW_KPI_CONTEXT,
  });

  return {
    capability: "configuration-setup-snapshot",
    contextBlock: [
      "PRISM data grounding: available filter and setup options for current user scope.",
      "Available dimensions: filter-options-only (utility list, period list, service-area list, category list as selectable filters). Does not include any KPI values, counts, or completion percentages.",
      `Report types available: ${options.reportTypes.length}`,
      `Report periods available: ${options.reportPeriods.length}`,
      `KPI categories available: ${options.kpiCategories.length}`,
      `KPI subcategories available: ${options.kpiSubcategories.length}`,
      `Service areas available: ${options.serviceAreas.length}`,
      `Sample report types: ${
        options.reportTypes
          .slice(0, 5)
          .map((item) => item.name)
          .join(", ") || "none"
      }`,
      `Sample service areas: ${
        options.serviceAreas
          .slice(0, 5)
          .map((item) => item.name)
          .join(", ") || "none"
      }`,
    ].join("\n"),
  };
};

export const buildVisualPresentationHintsContext = (
  latestUserMessage: string,
): CapabilityResolution => {
  const view = resolveRecommendedView(latestUserMessage);
  return {
    capability: "visual-presentation-hints",
    contextBlock: [
      "PRISM AI rendering hint:",
      `Recommended view for this question: ${view}`,
      "When useful, return concise structured sections suitable for conversion to that view.",
    ].join("\n"),
  };
};
