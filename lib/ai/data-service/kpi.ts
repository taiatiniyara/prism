import { getAccessibleReportPeriods } from "./common";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { withCache } from "../cache";
import { createToolMetadata, formatPercent } from "./common";
import type { AiToolResult } from "../types";

export interface KpiStatusSummary {
  utility_name: string;
  report_period: string;
  status_counts: {
    requested: number;
    pending: number;
    entered: number;
    reviewed: number;
    approved: number;
    not_available: number;
  };
  completion_rate: number;
  completion_display: string;
}

export interface KpiStatusData {
  periods: KpiStatusSummary[];
  aggregate: {
    total_requested: number;
    total_pending: number;
    total_completed: number;
    overall_completion_rate: number;
  };
  scope: "single_utility" | "all_utilities";
  default_utility: string | null;
  access_scope: "all_utilities" | "own_utility" | "unscoped";
  access_note: string;
}

export const getKpiStatus = async (
  user: CurrentUser,
  options: {
    utility_id?: number | null;
    report_period_id?: number | null;
    all_utilities?: boolean;
  } = {},
): Promise<AiToolResult<KpiStatusData>> => {
  // Submission / data-entry STATUS is own-utility OPERATIONAL data (#10 ruling,
  // spec §3.6): only globally-scoped admins (BMO/DEV) may see all utilities.
  // Utility roles (BLO/CEO/…) have benchmark access to APPROVED KPI results but
  // NOT to another utility's submission status — so gate this on
  // hasGlobalUtilityAccess, NEVER hasBenchmarkAccess, and reject an explicit
  // foreign utility_id (a BLO cannot read another utility's status by passing it).
  const canSeeAll = hasGlobalUtilityAccess(user);
  if (
    !canSeeAll &&
    options.utility_id != null &&
    options.utility_id !== user.org_id
  ) {
    return {
      data: {
        periods: [],
        aggregate: {
          total_requested: 0,
          total_pending: 0,
          total_completed: 0,
          overall_completion_rate: 0,
        },
        scope: "single_utility",
        default_utility: null,
        access_scope: "own_utility",
        access_note:
          "Data-entry status is scoped to your own utility; another utility's status is not visible to you.",
      },
      metadata: createToolMetadata({ completeness_pct: 0, source: "report_periods" }),
      error: `Access denied: data-entry status is own-utility only — utility_id=${options.utility_id} is not available to you.`,
    };
  }
  // Scoped users are ALWAYS own-org here, even if all_utilities=true is passed
  // (fail closed). Only global admins can request all utilities.
  const forceAllUtilities = canSeeAll ? options.all_utilities ?? true : false;
  const accessScope: KpiStatusData["access_scope"] = canSeeAll
    ? "all_utilities"
    : user.org_id != null
      ? "own_utility"
      : "unscoped";
  const accessNote: KpiStatusData["access_note"] = canSeeAll
    ? "Admin access: showing all utilities' data-entry status."
    : user.org_id != null
      ? `Access is scoped to your own utility only — other utilities' data exists on the platform but is not visible to you.`
      : "No utility scope found in your session — cross-utility data is not visible.";
  const periods = await withCache(
    `report_periods:${forceAllUtilities}:${user.id}`,
    () => getAccessibleReportPeriods(user, { forceAllUtilities }),
  );

  if (periods.length === 0) {
    return {
      data: {
        periods: [],
        aggregate: {
          total_requested: 0,
          total_pending: 0,
          total_completed: 0,
          overall_completion_rate: 0,
        },
        scope: forceAllUtilities ? "all_utilities" : "single_utility",
        default_utility: null,
        access_scope: accessScope,
        access_note: accessNote,
      },
      metadata: createToolMetadata({
        completeness_pct: 0,
        source: "report_periods",
      }),
    };
  }

  const defaultUtility = periods[0]?.Utility ?? null;
  const scopedPeriods = forceAllUtilities
    ? periods
    : periods.filter((p) => p.Utility === defaultUtility);

  const summaries: KpiStatusSummary[] = scopedPeriods.slice(0, 12).map((p) => {
    const completed = p.Entered + p.Reviewed + p.Approved;
    const completionRate = p.Requested > 0 ? completed / p.Requested : 0;

    return {
      utility_name: p.Utility || "N/A",
      report_period: p.Period,
      status_counts: {
        requested: p.Requested,
        pending: p.Pending,
        entered: p.Entered,
        reviewed: p.Reviewed,
        approved: p.Approved,
        not_available: p.Not_Available,
      },
      completion_rate: completionRate,
      completion_display: formatPercent(completed, p.Requested),
    };
  });

  const aggregate = scopedPeriods.reduce(
    (acc, p) => {
      acc.total_requested += p.Requested;
      acc.total_pending += p.Pending;
      acc.total_completed +=
        p.Entered + p.Reviewed + p.Approved;
      return acc;
    },
    {
      total_requested: 0,
      total_pending: 0,
      total_completed: 0,
      overall_completion_rate: 0,
    },
  );

  aggregate.overall_completion_rate =
    aggregate.total_requested > 0
      ? aggregate.total_completed / aggregate.total_requested
      : 0;

  return {
    data: {
      periods: summaries,
      aggregate,
      scope: forceAllUtilities ? "all_utilities" : "single_utility",
      default_utility: defaultUtility,
      access_scope: accessScope,
      access_note: accessNote,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: Math.round(aggregate.overall_completion_rate * 100),
      source: "report_periods",
    }),
  };
};
