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
  const top = sourcePeriods.slice(0, 5);

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

  const lines = top.map((row) => {
    return `- ${row.Period} (${row.Utility || "N/A"}): Requested=${row.Requested}, Pending=${row.Pending}, Entered=${row.Entered}, Reviewed=${row.Reviewed}, Approved=${row.Approved}, Endorsed=${row.Endorsed}, Not_Available=${row.Not_Available}`;
  });

  return {
    capability: "report-period-overview",
    contextBlock: [
      "PRISM data grounding: report period and submission snapshot.",
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
      "Most recent periods:",
      ...lines,
    ].join("\n"),
  };
};

export const buildBenchmarkingSnapshotContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const sourcePeriods = ctx.allUtilitiesRequested
    ? ctx.periods
    : ctx.scopedPeriods;

  const ranked = [...sourcePeriods]
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
    .sort((a, b) => b.completionRate - a.completionRate)
    .slice(0, 5)
    .map(
      (item) =>
        `- ${item.utility} (${item.period}): completion=${Math.round(item.completionRate * 100)}%, pending=${item.pending}, requested=${item.requested}`,
    );

  return {
    capability: "benchmarking-snapshot",
    contextBlock: [
      "PRISM data grounding: cross-utility/report-period benchmarking snapshot from submission performance.",
      `Scope mode: ${ctx.allUtilitiesRequested ? "all-utilities" : "default utility"}`,
      "Top completion records in scope:",
      ...(ranked.length ? ranked : ["- No benchmarkable records in scope."]),
      "Use cautiously: this benchmark is based on submission/completion indicators, not every KPI metric.",
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
