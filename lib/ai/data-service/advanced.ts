import { db } from "@/db/connection";
import { kpi, kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { countries, subRegions } from "@/db/schema/country";
import { eq, and, sql, desc } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

const resolvePeriodId = async (
  user: CurrentUser,
  reportPeriodId?: number | null,
  year?: number | null,
  month?: number | null,
): Promise<number | null> => {
  if (reportPeriodId) return reportPeriodId;
  const predicates = [];
  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    predicates.push(eq(reportPeriods.utility_id, user.org_id));
  }
  if (year) {
    predicates.push(sql`EXTRACT(YEAR FROM ${reportPeriods.report_date}) = ${year}`);
  }
  if (month) {
    predicates.push(sql`EXTRACT(MONTH FROM ${reportPeriods.report_date}) = ${month}`);
  }
  const [period] = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .where(predicates.length > 0 ? and(...predicates) : undefined)
    .orderBy(desc(reportPeriods.report_date))
    .limit(1);
  return period?.id ?? null;
};

// --- PEER-BASED TARGET SETTING ---

export interface KpiTargetRecommendation {
  kpi_name: string;
  current_value: number;
  peer_median: number;
  peer_top_quartile: number;
  peer_bottom_quartile: number;
  suggested_target: number;
  gap_to_median: number;
  gap_to_top_quartile: number;
  difficulty: "easy" | "moderate" | "stretch" | "extreme";
}

export interface TargetSettingData {
  recommendations: KpiTargetRecommendation[];
  peer_count: number;
  report_period: string | null;
}

export const getKpiTargets = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
    month?: number | null;
    all_utilities?: boolean;
  } = {},
): Promise<AiToolResult<TargetSettingData>> => {
  const periodId = await resolvePeriodId(user, options.report_period_id, options.year, options.month);
  if (!periodId) {
    return { data: { recommendations: [], peer_count: 0, report_period: null }, metadata: createToolMetadata({ source: "kpi_values" }), error: "No period found" };
  }

  const rows = await db
    .select({
      kpiName: kpiDefinitions.name,
      actualValue: kpi.actual_value,
      utilityId: reportPeriods.utility_id,
      utilityName: organisations.acronym,
      periodDate: reportPeriods.report_date,
    })
    .from(kpi)
    .innerJoin(kpiDefinitions, eq(kpi.kpi_def_id, kpiDefinitions.id))
    .innerJoin(reportPeriods, eq(kpi.report_period_id, reportPeriods.id))
    .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
    .where(and(eq(kpi.report_period_id, periodId), eq(kpiDefinitions.is_active, true)))
    .limit(2000);

  const byKpi = new Map<string, number[]>();
  for (const row of rows) {
    const val = parseFloat(row.actualValue);
    if (isNaN(val)) continue;
    const arr = byKpi.get(row.kpiName) ?? [];
    arr.push(val);
    byKpi.set(row.kpiName, arr);
  }

  const recommendations: KpiTargetRecommendation[] = [];

  for (const [name, values] of byKpi) {
    if (values.length < 3) continue;
    values.sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)];
    const topQ = values[Math.floor(values.length * 0.75)];
    const botQ = values[Math.floor(values.length * 0.25)];
    const current = values[0] ?? median;

    const gapToTopQ = topQ - current;
    const difficulty: KpiTargetRecommendation["difficulty"] =
      gapToTopQ <= 0 ? "easy" : gapToTopQ < median * 0.2 ? "moderate" : gapToTopQ < median * 0.5 ? "stretch" : "extreme";

    recommendations.push({
      kpi_name: name,
      current_value: Math.round(current * 100) / 100,
      peer_median: Math.round(median * 100) / 100,
      peer_top_quartile: Math.round(topQ * 100) / 100,
      peer_bottom_quartile: Math.round(botQ * 100) / 100,
      suggested_target: Math.round((current + (topQ - current) * 0.3) * 100) / 100,
      gap_to_median: Math.round((median - current) * 100) / 100,
      gap_to_top_quartile: Math.round((topQ - current) * 100) / 100,
      difficulty,
    });
  }

  recommendations.sort((a, b) => b.gap_to_top_quartile - a.gap_to_top_quartile);

  return {
    data: { recommendations, peer_count: new Set(rows.map((r) => r.utilityId)).size, report_period: rows[0]?.periodDate?.toString() ?? null },
    metadata: createToolMetadata({ freshness: new Date(), source: "kpi_values" }),
  };
};

// --- CROSS-KPI CORRELATION ---

export interface CorrelationPair {
  kpi_a: string;
  kpi_b: string;
  coefficient: number;
  strength: "strong_positive" | "moderate_positive" | "weak" | "moderate_negative" | "strong_negative";
  sample_size: number;
}

export interface CorrelationData {
  pairs: CorrelationPair[];
  utility_count: number;
  report_period: string | null;
}

export const getKpiCorrelation = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
    month?: number | null;
  } = {},
): Promise<AiToolResult<CorrelationData>> => {
  const periodId = await resolvePeriodId(user, options.report_period_id, options.year, options.month);
  if (!periodId) {
    return { data: { pairs: [], utility_count: 0, report_period: null }, metadata: createToolMetadata({ source: "kpi_values" }), error: "No period found" };
  }

  const rows = await db
    .select({
      kpiName: kpiDefinitions.name,
      actualValue: kpi.actual_value,
      utilityId: reportPeriods.utility_id,
      periodDate: reportPeriods.report_date,
    })
    .from(kpi)
    .innerJoin(kpiDefinitions, eq(kpi.kpi_def_id, kpiDefinitions.id))
    .innerJoin(reportPeriods, eq(kpi.report_period_id, reportPeriods.id))
    .where(and(eq(kpi.report_period_id, periodId), eq(kpiDefinitions.is_active, true)))
    .limit(2000);

  const byUtility = new Map<number, Record<string, number>>();
  for (const row of rows) {
    const val = parseFloat(row.actualValue);
    if (isNaN(val)) continue;
    const rec = byUtility.get(row.utilityId) ?? {};
    rec[row.kpiName] = val;
    byUtility.set(row.utilityId, rec);
  }

  const kpiNames = [...new Set(rows.map((r) => r.kpiName))].slice(0, 20);
  const pairs: CorrelationPair[] = [];

  for (let i = 0; i < kpiNames.length; i++) {
    for (let j = i + 1; j < kpiNames.length; j++) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [, rec] of byUtility) {
        const x = rec[kpiNames[i]];
        const y = rec[kpiNames[j]];
        if (x != null && y != null) { xs.push(x); ys.push(y); }
      }
      if (xs.length < 3) continue;
      const coeff = pearson(xs, ys);
      const strength: CorrelationPair["strength"] =
        coeff > 0.7 ? "strong_positive" : coeff > 0.4 ? "moderate_positive" : coeff > -0.4 ? "weak" : coeff > -0.7 ? "moderate_negative" : "strong_negative";
      pairs.push({ kpi_a: kpiNames[i], kpi_b: kpiNames[j], coefficient: Math.round(coeff * 100) / 100, strength, sample_size: xs.length });
    }
  }

  pairs.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

  return {
    data: { pairs: pairs.slice(0, 30), utility_count: byUtility.size, report_period: rows[0]?.periodDate?.toString() ?? null },
    metadata: createToolMetadata({ freshness: new Date(), source: "kpi_values" }),
  };
};

const pearson = (xs: number[], ys: number[]): number => {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const sumXX = xs.reduce((a, b) => a + b * b, 0);
  const sumYY = ys.reduce((a, b) => a + b * b, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  return den === 0 ? 0 : num / den;
};

// --- MULTI-UTILITY KPI COMPARISON ---

export interface MultiUtilityKpiValue {
  utility_name: string;
  kpi_name: string;
  value: number;
  rank: number;
}

export interface MultiUtilityKpiData {
  values: MultiUtilityKpiValue[];
  kpi_name: string;
  utility_count: number;
  report_period: string | null;
}

export const compareKpisAcrossUtilities = async (
  user: CurrentUser,
  options: {
    kpi_names: string[];
    report_period_id?: number | null;
    year?: number | null;
    month?: number | null;
  },
): Promise<AiToolResult<MultiUtilityKpiData[]>> => {
  const periodId = await resolvePeriodId(user, options.report_period_id, options.year, options.month);
  if (!periodId) {
    return { data: [], metadata: createToolMetadata({ source: "kpi_values" }), error: "No period found" };
  }

  const results: MultiUtilityKpiData[] = [];

  for (const kpiName of options.kpi_names) {
    const rows = await db
      .select({
        kpiName: kpiDefinitions.name,
        actualValue: kpi.actual_value,
        utilityName: organisations.acronym,
        utilityId: reportPeriods.utility_id,
        periodDate: reportPeriods.report_date,
      })
      .from(kpi)
      .innerJoin(kpiDefinitions, eq(kpi.kpi_def_id, kpiDefinitions.id))
      .innerJoin(reportPeriods, eq(kpi.report_period_id, reportPeriods.id))
      .innerJoin(organisations, eq(reportPeriods.utility_id, organisations.id))
      .where(
        and(
          eq(kpi.report_period_id, periodId),
          sql`LOWER(${kpiDefinitions.name}) LIKE ${`%${kpiName.toLowerCase()}%`}`,
          eq(kpiDefinitions.is_active, true),
        ),
      )
      .limit(100);

    const values: MultiUtilityKpiValue[] = rows
      .map((r) => {
        const val = parseFloat(r.actualValue);
        if (isNaN(val)) return null;
        return { utility_name: r.utilityName ?? "N/A", kpi_name: r.kpiName, value: Math.round(val * 100) / 100, rank: 0 };
      })
      .filter((v): v is MultiUtilityKpiValue => v != null)
      .sort((a, b) => a.value - b.value);

    values.forEach((v, i) => { v.rank = i + 1; });

    results.push({
      values,
      kpi_name: kpiName,
      utility_count: values.length,
      report_period: rows[0]?.periodDate?.toString() ?? null,
    });
  }

  return { data: results, metadata: createToolMetadata({ freshness: new Date(), source: "kpi_values" }) };
};

// --- EXPORT / REPORT ---

export interface ExportReportData {
  url: string;
  format: string;
  filename: string;
}

export const generateExport = async (
  user: CurrentUser,
  options: {
    title: string;
    columns: string[];
    rows: Array<Array<string | number>>;
    format: "csv" | "excel";
  },
): Promise<AiToolResult<ExportReportData>> => {
  const filename = `${options.title.replace(/[^a-z0-9]/gi, "_").slice(0, 50)}.${options.format === "excel" ? "xlsx" : "csv"}`;

  return {
    data: {
      url: `/api/ai/export?format=${options.format}`,
      format: options.format,
      filename,
    },
    metadata: createToolMetadata({ source: "export" }),
  };
};

// --- COUNTRY / REGION HIERARCHY ---

export interface CountryRegionItem {
  country_name: string;
  iso_code: string;
  sub_region: string;
  un_region: string;
  utility_count: number;
  is_adb_member: boolean;
}

export const getCountryHierarchy = async (
): Promise<AiToolResult<CountryRegionItem[]>> => {
  const rows = await db
    .select({
      country: countries.name,
      iso: countries.iso_code_alpha3,
      subRegion: subRegions.name,
      unRegion: subRegions.un_continental_region,
      isAdb: countries.is_adb_member,
    })
    .from(countries)
    .innerJoin(subRegions, eq(countries.sub_region_id, subRegions.id))
    .where(eq(subRegions.is_active, true))
    .orderBy(subRegions.name, countries.name)
    .limit(100);

  const items: CountryRegionItem[] = rows.map((r) => ({
    country_name: r.country,
    iso_code: r.iso ?? "N/A",
    sub_region: r.subRegion ?? "N/A",
    un_region: r.unRegion ?? "N/A",
    utility_count: 0,
    is_adb_member: r.isAdb === true,
  }));

  return { data: items, metadata: createToolMetadata({ freshness: new Date(), source: "countries" }) };
};
