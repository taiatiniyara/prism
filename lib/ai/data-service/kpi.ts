import { GetReportPeriods } from "@/app/data-entry/service";
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
    endorsed: number;
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
}

export const getKpiStatus = async (
  user: CurrentUser,
  options: {
    utility_id?: number | null;
    report_period_id?: number | null;
    all_utilities?: boolean;
  } = {},
): Promise<AiToolResult<KpiStatusData>> => {
  const forceAllUtilities = options.all_utilities === true && hasGlobalUtilityAccess(user);
  const periods = await withCache(
    `report_periods:${forceAllUtilities}:${user.id}`,
    () => GetReportPeriods(user, { forceAllUtilities }),
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
    const completed = p.Entered + p.Reviewed + p.Approved + p.Endorsed;
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
        endorsed: p.Endorsed,
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
        p.Entered + p.Reviewed + p.Approved + p.Endorsed;
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
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: Math.round(aggregate.overall_completion_rate * 100),
      source: "report_periods",
    }),
  };
};
