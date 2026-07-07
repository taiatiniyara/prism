import { db } from "@/db/connection";
import { organisations } from "@/db/schema/utility";
import { countries, subRegions } from "@/db/schema/country";
import { eq, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { getAccessibleReportPeriods } from "./common";
import { listReviewKpiRows } from "@/app/data-entry/review-kpi/service";
import { createToolMetadata, resolvePeriod } from "./common";
import type { AiToolResult } from "../types";



export interface ServiceAreaBreakdown {
  service_area: string;
  kpi_count: number;
  completeness_pct: number;
  pending: number;
  entered: number;
  reviewed: number;
  approved: number;
}

export interface ServiceAreaBreakdownData {
  service_areas: ServiceAreaBreakdown[];
  total_kpis: number;
  report_period: string | null;
}

export const getServiceAreaBreakdown = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
  } = {},
): Promise<AiToolResult<ServiceAreaBreakdownData>> => {
  const period = await resolvePeriod(user, options);
  if (!period) {
    return {
      data: { service_areas: [], total_kpis: 0, report_period: null },
      metadata: createToolMetadata({ source: "review_kpi" }),
      error: "No report period found",
    };
  }

  const rows = await listReviewKpiRows({
    reportTypeId: null,
    reportPeriodId: period.id,
    kpiCategoryId: null,
    kpiSubcategoryId: null,
    serviceAreaId: null,
  });

  const byServiceArea = new Map<number, { name: string; total: number; completed: number }>();
  for (const row of rows) {
    if (row.serviceAreaId == null) continue;
    const entry = byServiceArea.get(row.serviceAreaId) ?? { name: `SA ${row.serviceAreaId}`, total: 0, completed: 0 };
    entry.total++;
    if (row.result.status === "calculated") entry.completed++;
    byServiceArea.set(row.serviceAreaId, entry);
  }

  const serviceAreas: ServiceAreaBreakdown[] = Array.from(byServiceArea.entries())
    .map(([_id, data]) => ({
      service_area: data.name,
      kpi_count: data.total,
      completeness_pct: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
      pending: data.total - data.completed,
      entered: 0,
      reviewed: 0,
      approved: data.completed,
    }))
    .sort((a, b) => a.completeness_pct - b.completeness_pct);

  const periods = await getAccessibleReportPeriods(user, { forceAllUtilities: hasGlobalUtilityAccess(user) });
  const match = periods.find((p) => p.Id === period.id);

  return {
    data: {
      service_areas: serviceAreas,
      total_kpis: rows.length,
      report_period: match?.Period ?? null,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "review_kpi" }),
  };
};

export interface PeerGroupItem {
  utility_name: string;
  completion_pct: number;
  pending: number;
  trend_direction: "improved" | "declined" | "stable";
}

export interface PeerGroupData {
  peers: PeerGroupItem[];
  group_average_completion: number;
  group_average_score: number | null;
  user_utility_rank: number | null;
  total_peers: number;
}

export const getPeerGroupAnalysis = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
    group_by?: "country" | "size" | "region";
    group_value?: string;
  } = {},
): Promise<AiToolResult<PeerGroupData>> => {
  const periods = await getAccessibleReportPeriods(user, { forceAllUtilities: hasGlobalUtilityAccess(user) });
  if (periods.length === 0) {
    return {
      data: { peers: [], group_average_completion: 0, group_average_score: null, user_utility_rank: null, total_peers: 0 },
      metadata: createToolMetadata({ source: "report_periods" }),
      error: "No data available",
    };
  }

  let filteredPeriods = periods;

  if (options.group_by === "country" && options.group_value) {
    const countryOrgs = await db
      .select({ id: organisations.id })
      .from(organisations)
      .innerJoin(countries, eq(organisations.country_id, countries.id))
      .where(sql`LOWER(${countries.name}) = ${options.group_value.toLowerCase()}`)
      .limit(100);

    const orgIds = new Set(countryOrgs.map((o) => o.id));
    filteredPeriods = periods.filter((p) => orgIds.has(p.Utility_id));
  } else if (options.group_by === "region" && options.group_value) {
    const regionOrgs = await db
      .select({ id: organisations.id })
      .from(organisations)
      .innerJoin(countries, eq(organisations.country_id, countries.id))
      .innerJoin(subRegions, eq(countries.sub_region_id, subRegions.id))
      .where(sql`LOWER(${subRegions.name}) = ${options.group_value.toLowerCase()}`)
      .limit(100);

    const orgIds = new Set(regionOrgs.map((o) => o.id));
    filteredPeriods = periods.filter((p) => orgIds.has(p.Utility_id));
  }

  const peers: PeerGroupItem[] = filteredPeriods.map((p) => {
    const completed = p.Entered + p.Reviewed + p.Approved + p.Endorsed;
    const completion = p.Requested > 0 ? Math.round((completed / p.Requested) * 100) : 0;
    return {
      utility_name: p.Utility || "N/A",
      completion_pct: completion,
      pending: p.Pending,
      trend_direction: "stable" as const,
    };
  });

  const avgCompletion = peers.length > 0
    ? Math.round(peers.reduce((s, p) => s + p.completion_pct, 0) / peers.length)
    : 0;

  const sorted = [...peers].sort((a, b) => b.completion_pct - a.completion_pct);
  const userRank = user.org_id ? sorted.findIndex((p) => p.utility_name === periods[0]?.Utility) + 1 : null;

  return {
    data: {
      peers: peers.slice(0, 20),
      group_average_completion: avgCompletion,
      group_average_score: null,
      user_utility_rank: userRank || null,
      total_peers: peers.length,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "report_periods" }),
  };
};

export interface PeriodComparison {
  metric: string;
  period_a_value: number;
  period_b_value: number;
  delta: number;
  delta_pct: number;
  direction: "improved" | "declined" | "stable";
}

export interface ComparePeriodsData {
  comparisons: PeriodComparison[];
  period_a: string;
  period_b: string;
  utility: string;
}

export const comparePeriods = async (
  user: CurrentUser,
  options: {
    period_a_id?: number | null;
    period_b_id?: number | null;
    year_a?: number | null;
    year_b?: number | null;
  } = {},
): Promise<AiToolResult<ComparePeriodsData>> => {
  const periods = await getAccessibleReportPeriods(user, { forceAllUtilities: false });
  if (periods.length < 2) {
    return {
      data: { comparisons: [], period_a: "", period_b: "", utility: "" },
      metadata: createToolMetadata({ source: "report_periods" }),
      error: "Need at least 2 periods for comparison",
    };
  }

  let a = periods.find((p) => options.period_a_id ? p.Id === options.period_a_id : false);
  let b = periods.find((p) => options.period_b_id ? p.Id === options.period_b_id : false);

  if (!a && options.year_a) {
    a = periods.find((p) => p.Period.includes(String(options.year_a)));
  }
  if (!b && options.year_b) {
    b = periods.find((p) => p.Period.includes(String(options.year_b)));
  }

  if (!a) a = periods[1];
  if (!b) b = periods[0];

  if (!a || !b) {
    return {
      data: { comparisons: [], period_a: "", period_b: "", utility: "" },
      metadata: createToolMetadata({ source: "report_periods" }),
      error: "Could not resolve both periods",
    };
  }

  const comparisons: PeriodComparison[] = [
    {
      metric: "Completion Rate",
      period_a_value: a.Requested > 0 ? Math.round(((a.Entered + a.Reviewed + a.Approved + a.Endorsed) / a.Requested) * 100) : 0,
      period_b_value: b.Requested > 0 ? Math.round(((b.Entered + b.Reviewed + b.Approved + b.Endorsed) / b.Requested) * 100) : 0,
      delta: 0,
      delta_pct: 0,
      direction: "stable" as const,
    },
    { metric: "Requested KPIs", period_a_value: a.Requested, period_b_value: b.Requested, delta: 0, delta_pct: 0, direction: "stable" },
    { metric: "Pending KPIs", period_a_value: a.Pending, period_b_value: b.Pending, delta: 0, delta_pct: 0, direction: "stable" },
    { metric: "Entered KPIs", period_a_value: a.Entered, period_b_value: b.Entered, delta: 0, delta_pct: 0, direction: "stable" },
    { metric: "Reviewed KPIs", period_a_value: a.Reviewed, period_b_value: b.Reviewed, delta: 0, delta_pct: 0, direction: "stable" },
    { metric: "Approved/Endorsed KPIs", period_a_value: a.Approved + a.Endorsed, period_b_value: b.Approved + b.Endorsed, delta: 0, delta_pct: 0, direction: "stable" },
  ];

  for (const c of comparisons) {
    c.delta = c.period_b_value - c.period_a_value;
    c.delta_pct = c.period_a_value > 0 ? Math.round((c.delta / c.period_a_value) * 100) : 0;
    c.direction = c.delta > 5 ? "improved" : c.delta < -5 ? "declined" : "stable";
  }

  return {
    data: {
      comparisons,
      period_a: a.Period,
      period_b: b.Period,
      utility: a.Utility || "N/A",
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "report_periods" }),
  };
};
