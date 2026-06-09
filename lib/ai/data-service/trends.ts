import { GetReportPeriods } from "@/app/data-entry/service";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface TrendRecord {
  utility_name: string;
  first_period: string;
  first_completion_rate: number;
  latest_period: string;
  latest_completion_rate: number;
  delta_pp: number;
  direction: "improved" | "declined" | "stable";
}

export interface TrendData {
  trends: TrendRecord[];
  most_improved: TrendRecord[];
  most_declined: TrendRecord[];
}

export const getTrendAnalysis = async (
  user: CurrentUser,
  options: {
    all_utilities?: boolean;
  } = {},
): Promise<AiToolResult<TrendData>> => {
  const forceAllUtilities = options.all_utilities === true && hasGlobalUtilityAccess(user);
  const periods = await GetReportPeriods(user, {
    forceAllUtilities,
  });

  if (periods.length === 0) {
    return {
      data: {
        trends: [],
        most_improved: [],
        most_declined: [],
      },
      metadata: createToolMetadata({
        completeness_pct: 0,
        source: "report_periods",
      }),
    };
  }

  const byUtility = new Map<
    string,
    { first: typeof periods[0]; latest: typeof periods[0] }
  >();

  for (const period of [...periods].reverse()) {
    const key = period.Utility || "N/A";
    const current = byUtility.get(key);
    if (!current) {
      byUtility.set(key, { first: period, latest: period });
    } else {
      byUtility.set(key, { first: current.first, latest: period });
    }
  }

  const trends: TrendRecord[] = Array.from(byUtility.entries())
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

      const deltaPp = Math.round((latestRate - firstRate) * 100);
      const direction: TrendRecord["direction"] =
        deltaPp > 5 ? "improved" : deltaPp < -5 ? "declined" : "stable";

      return {
        utility_name: utility,
        first_period: pair.first.Period,
        first_completion_rate: firstRate,
        latest_period: pair.latest.Period,
        latest_completion_rate: latestRate,
        delta_pp: deltaPp,
        direction,
      };
    })
    .sort((a, b) => b.delta_pp - a.delta_pp);

  const mostImproved = trends.filter((t) => t.direction === "improved").slice(0, 5);
  const mostDeclined = trends.filter((t) => t.direction === "declined").slice(0, 5);

  return {
    data: {
      trends,
      most_improved: mostImproved,
      most_declined: mostDeclined,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: trends.length > 0 ? 100 : 0,
      source: "report_periods",
    }),
  };
};
