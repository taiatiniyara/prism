import { GetReportPeriods } from "@/app/data-entry/service";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface GovernanceRecord {
  utility_name: string;
  period: string;
  pending_with: string;
  updated: string;
}

export interface GovernanceData {
  pending_ownership: Array<{ owner: string; count: number }>;
  recent_updates: GovernanceRecord[];
  total_periods_in_scope: number;
}

export const getGovernanceAudit = async (
  user: CurrentUser,
  options: {
    all_utilities?: boolean;
  } = {},
): Promise<AiToolResult<GovernanceData>> => {
  const periods = await GetReportPeriods(user, {
    forceAllUtilities: options.all_utilities === true,
  });

  if (periods.length === 0) {
    return {
      data: {
        pending_ownership: [],
        recent_updates: [],
        total_periods_in_scope: 0,
      },
      metadata: createToolMetadata({
        completeness_pct: 0,
        source: "report_periods",
      }),
    };
  }

  const byPendingWith = periods.reduce(
    (acc, period) => {
      const key = period.Pending_With || "Unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const pendingOwnership = Object.entries(byPendingWith)
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count);

  const recentUpdates: GovernanceRecord[] = periods.slice(0, 10).map((p) => ({
    utility_name: p.Utility || "N/A",
    period: p.Period,
    pending_with: p.Pending_With || "Unknown",
    updated: p.Updated,
  }));

  return {
    data: {
      pending_ownership: pendingOwnership,
      recent_updates: recentUpdates,
      total_periods_in_scope: periods.length,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: 100,
      source: "report_periods",
    }),
  };
};
