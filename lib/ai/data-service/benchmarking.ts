import { GetReportPeriods } from "@/app/data-entry/service";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface BenchmarkingRecord {
  utility_name: string;
  report_period: string;
  completion_rate: number;
  completion_display: string;
  pending: number;
  requested: number;
  rank: number;
}

export interface BenchmarkingData {
  records: BenchmarkingRecord[];
  user_utility: {
    name: string;
    rank: number;
    completion_rate: number;
    peer_average: number;
    gap_to_peer_average: number;
  } | null;
  peer_average: number;
  top_performers: BenchmarkingRecord[];
  bottom_performers: BenchmarkingRecord[];
}

export const getBenchmarkingData = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    limit?: number;
  } = {},
): Promise<AiToolResult<BenchmarkingData>> => {
  const periods = await GetReportPeriods(user, { forceAllUtilities: true });

  if (periods.length === 0) {
    return {
      data: {
        records: [],
        user_utility: null,
        peer_average: 0,
        top_performers: [],
        bottom_performers: [],
      },
      metadata: createToolMetadata({
        completeness_pct: 0,
        source: "report_periods",
      }),
    };
  }

  const ranked: BenchmarkingRecord[] = periods
    .map((p) => {
      const completed = p.Entered + p.Reviewed + p.Approved + p.Endorsed;
      const completionRate = p.Requested > 0 ? completed / p.Requested : 0;

      return {
        utility_name: p.Utility || "N/A",
        report_period: p.Period,
        completion_rate: completionRate,
        completion_display: `${Math.round(completionRate * 100)}%`,
        pending: p.Pending,
        requested: p.Requested,
        rank: 0,
      };
    })
    .sort((a, b) => b.completion_rate - a.completion_rate)
    .map((record, index) => ({ ...record, rank: index + 1 }));

  const limit = options.limit ?? 20;
  const records = ranked.slice(0, limit);
  const topPerformers = ranked.slice(0, 5);
  const bottomPerformers = [...ranked].reverse().slice(0, 5);

  const peerAverage =
    ranked.length > 0
      ? ranked.reduce((sum, r) => sum + r.completion_rate, 0) / ranked.length
      : 0;

  const defaultUtility = periods[0]?.Utility ?? null;
  let userUtility: BenchmarkingData["user_utility"] = null;

  if (defaultUtility) {
    const userRecords = ranked.filter((r) => r.utility_name === defaultUtility);
    const userRecord = userRecords[0];

    if (userRecord) {
      const peerRecords = ranked.filter(
        (r) =>
          r.report_period === userRecord.report_period &&
          r.utility_name !== defaultUtility,
      );

      const peerAvg =
        peerRecords.length > 0
          ? peerRecords.reduce((sum, r) => sum + r.completion_rate, 0) /
            peerRecords.length
          : 0;

      userUtility = {
        name: defaultUtility,
        rank: userRecord.rank,
        completion_rate: userRecord.completion_rate,
        peer_average: peerAvg,
        gap_to_peer_average: userRecord.completion_rate - peerAvg,
      };
    }
  }

  return {
    data: {
      records,
      user_utility: userUtility,
      peer_average: peerAverage,
      top_performers: topPerformers,
      bottom_performers: bottomPerformers,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: Math.round(peerAverage * 100),
      source: "report_periods",
    }),
  };
};
