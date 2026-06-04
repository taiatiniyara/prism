import { GetReportPeriods } from "@/app/data-entry/service";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface AnomalyRecord {
  utility_name: string;
  period: string;
  anomaly_type: "completion_drop" | "pending_increase" | "not_available_increase";
  severity: "high" | "medium" | "low";
  description: string;
  delta_pp: number;
}

export interface WatchlistRecord {
  utility_name: string;
  period: string;
  pending: number;
  requested: number;
  pending_rate: number;
}

export interface AnomalyData {
  anomalies: AnomalyRecord[];
  watchlist: WatchlistRecord[];
  threshold_policy: {
    completion_drop_threshold: number;
    pending_increase_threshold: number;
    not_available_increase_threshold: number;
  };
}

export const getAnomalyInsights = async (
  user: CurrentUser,
  options: {
    all_utilities?: boolean;
  } = {},
): Promise<AiToolResult<AnomalyData>> => {
  const periods = await GetReportPeriods(user, {
    forceAllUtilities: options.all_utilities === true,
  });

  const thresholdPolicy = {
    completion_drop_threshold: 10,
    pending_increase_threshold: 10,
    not_available_increase_threshold: 5,
  };

  if (periods.length === 0) {
    return {
      data: {
        anomalies: [],
        watchlist: [],
        threshold_policy: thresholdPolicy,
      },
      metadata: createToolMetadata({
        completeness_pct: 0,
        source: "report_periods",
      }),
    };
  }

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

  for (const row of periods.slice(0, 24)) {
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

  const anomalies: AnomalyRecord[] = [];

  for (const [utility, records] of utilitySeries.entries()) {
    if (records.length < 2) continue;

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

    if (completionDrop <= -thresholdPolicy.completion_drop_threshold) {
      anomalies.push({
        utility_name: utility,
        period: latest.period,
        anomaly_type: "completion_drop",
        severity: Math.abs(completionDrop) >= 20 ? "high" : "medium",
        description: `Completion dropped ${Math.abs(completionDrop)}pp from ${previous.period} to ${latest.period}`,
        delta_pp: completionDrop,
      });
    }

    if (pendingJump >= thresholdPolicy.pending_increase_threshold) {
      anomalies.push({
        utility_name: utility,
        period: latest.period,
        anomaly_type: "pending_increase",
        severity: pendingJump >= 20 ? "high" : "medium",
        description: `Pending rate increased ${pendingJump}pp from ${previous.period} to ${latest.period}`,
        delta_pp: pendingJump,
      });
    }

    if (notAvailableJump >= thresholdPolicy.not_available_increase_threshold) {
      anomalies.push({
        utility_name: utility,
        period: latest.period,
        anomaly_type: "not_available_increase",
        severity: notAvailableJump >= 10 ? "high" : "low",
        description: `Not-available rate increased ${notAvailableJump}pp from ${previous.period} to ${latest.period}`,
        delta_pp: notAvailableJump,
      });
    }
  }

  const watchlist: WatchlistRecord[] = periods
    .map((row) => ({
      utility_name: row.Utility || "N/A",
      period: row.Period,
      pending: row.Pending,
      requested: row.Requested,
      pending_rate:
        row.Requested > 0 ? Math.round((row.Pending / row.Requested) * 100) : 0,
    }))
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 5);

  return {
    data: {
      anomalies: anomalies.slice(0, 10),
      watchlist,
      threshold_policy: thresholdPolicy,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: anomalies.length > 0 ? 100 : 50,
      source: "report_periods",
    }),
  };
};
