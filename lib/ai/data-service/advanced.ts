import { db } from "@/db/connection";
import { countries, subRegions } from "@/db/schema/country";
import { kpiDefinitions } from "@/db/schema/kpi";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasBenchmarkAccess } from "@/lib/user.service";
import { createToolMetadata, resolveComparisonPeriodIds, intArrayParam } from "./common";
import type { AiToolResult } from "../types";

const buildKpiAccessInfo = (user: CurrentUser): KpiAccessInfo => ({
  scope: hasBenchmarkAccess(user) ? "all_utilities" : "own_utility",
  note: hasBenchmarkAccess(user)
    ? "Benchmark access: includes every utility with approved Financial Year reporting in the selected period(s)."
    : "Access is scoped to your own utility only — other utilities' data exists on the platform but is not visible to you.",
});

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
  access: KpiAccessInfo;
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
  const periodIds = await resolveComparisonPeriodIds(user, { report_period_id: options.report_period_id, year: options.year, month: options.month });
  if (periodIds.length === 0) {
    return { data: { recommendations: [], peer_count: 0, report_period: null, access: buildKpiAccessInfo(user) }, metadata: createToolMetadata({ source: "kpi_values" }), error: "No period found" };
  }

  const result = await db.execute(sql`
    SELECT kpi_name, actual_value, utility_id, utility_acronym, report_date
    FROM gold.fact_kpi
    WHERE report_period_id = ANY(${intArrayParam(periodIds)})
    LIMIT 2000
  `);

  const rows = result.rows as Array<{
    kpi_name: string;
    actual_value: string | null;
    utility_id: number;
    utility_acronym: string;
    report_date: string;
  }>;

  const byKpi = new Map<string, number[]>();
  for (const row of rows) {
    const val = row.actual_value ? parseFloat(row.actual_value) : NaN;
    if (isNaN(val)) continue;
    const arr = byKpi.get(row.kpi_name) ?? [];
    arr.push(val);
    byKpi.set(row.kpi_name, arr);
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
    data: { recommendations, peer_count: new Set(rows.map((r) => r.utility_id)).size, report_period: rows[0]?.report_date?.toString() ?? null, access: buildKpiAccessInfo(user) },
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
  access: KpiAccessInfo;
}

export const getKpiCorrelation = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
    month?: number | null;
  } = {},
): Promise<AiToolResult<CorrelationData>> => {
  const periodIds = await resolveComparisonPeriodIds(user, { report_period_id: options.report_period_id, year: options.year, month: options.month });
  if (periodIds.length === 0) {
    return { data: { pairs: [], utility_count: 0, report_period: null, access: buildKpiAccessInfo(user) }, metadata: createToolMetadata({ source: "kpi_values" }), error: "No period found" };
  }

  const result = await db.execute(sql`
    SELECT kpi_name, actual_value, utility_id, report_date
    FROM gold.fact_kpi
    WHERE report_period_id = ANY(${intArrayParam(periodIds)})
    LIMIT 2000
  `);

  const rows = result.rows as Array<{
    kpi_name: string;
    actual_value: string | null;
    utility_id: number;
    report_date: string;
  }>;

  const byUtility = new Map<number, Record<string, number>>();
  for (const row of rows) {
    const val = row.actual_value ? parseFloat(row.actual_value) : NaN;
    if (isNaN(val)) continue;
    const rec = byUtility.get(row.utility_id) ?? {};
    rec[row.kpi_name] = val;
    byUtility.set(row.utility_id, rec);
  }

  const kpiNames = [...new Set(rows.map((r) => r.kpi_name))].slice(0, 20);
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
    data: { pairs: pairs.slice(0, 30), utility_count: byUtility.size, report_period: rows[0]?.report_date?.toString() ?? null, access: buildKpiAccessInfo(user) },
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

export interface KpiAccessInfo {
  scope: "all_utilities" | "own_utility";
  note: string;
}

export interface MultiUtilityKpiValue {
  utility_name: string;
  kpi_name: string;
  value: number;
  rank: number;
}

export interface MultiUtilityKpiData {
  values: MultiUtilityKpiValue[];
  kpi_name: string;
  matched_kpi_names: string[];
  utility_count: number;
  report_period: string | null;
  access: KpiAccessInfo;
}

// Aliases bridging common industry terms to their canonical gold-layer KPI
// names. `kpi_definitions.synonyms` is consulted first; this map only covers
// terms users/LMs actually say that the definitions don't, so comparisons like
// "System Loss", "Tariff Recovery" or "Renewable Penetration" resolve to the
// real gold facts (Network Delivery Losses, Operating Cost Recovery, Renewable
// Energy to Grid) instead of returning nothing.
const KPI_ALIASES: Record<string, string[]> = {
  "system loss": ["Network Delivery Losses", "Transmission Network Losses"],
  "losses": ["Network Delivery Losses", "Transmission Network Losses"],
  "tariff recovery": ["Operating Cost Recovery", "Operating Cost Covered by Subsidies"],
  "operating cost recovery": ["Operating Cost Recovery", "Operating Cost Covered by Subsidies"],
  "renewable penetration": ["Renewable Energy to Grid"],
  "renewable energy": ["Renewable Energy to Grid"],
  "capacity factor": ["Generator Capacity Factor"],
  "saidi": ["Planned SAIDI"],
  "saifi": ["Planned SAIFI"],
  "reliability": ["Planned SAIDI", "Planned SAIFI", "Distribution Reliability"],
};

const resolveKpiPatterns = async (term: string): Promise<string[]> => {
  const raw = term.trim();
  const like = `%${raw}%`;

  const defs = await db
    .select({
      name: kpiDefinitions.name,
      synonyms: kpiDefinitions.synonyms,
    })
    .from(kpiDefinitions)
    .where(
      and(
        eq(kpiDefinitions.is_active, true),
        or(
          ilike(kpiDefinitions.name, like),
          sql`${kpiDefinitions.synonyms}::text ILIKE ${like}`,
        ),
      ),
    )
    .limit(20);

  const patterns = new Set<string>();
  for (const def of defs) {
    if (def.name) patterns.add(def.name);
    for (const synonym of def.synonyms ?? []) {
      if (synonym) patterns.add(synonym);
    }
  }

  const aliases = KPI_ALIASES[raw.toLowerCase()];
  if (aliases) for (const aliasName of aliases) patterns.add(aliasName);

  if (patterns.size === 0) patterns.add(like); // fall back to substring match

  return [...patterns];
};

export const compareKpisAcrossUtilities = async (
  user: CurrentUser,
  options: {
    kpi_names: string[];
    report_period_id?: number | null;
    year?: number | null;
    month?: number | null;
    all_utilities?: boolean;
    utility_id?: number | null;
  },
): Promise<AiToolResult<MultiUtilityKpiData[]>> => {
  const periodIds = await resolveComparisonPeriodIds(user, { report_period_id: options.report_period_id, year: options.year, month: options.month });
  if (periodIds.length === 0) {
    return { data: [], metadata: createToolMetadata({ source: "kpi_values" }), error: "No period found" };
  }

  const canBenchmark = hasBenchmarkAccess(user);

  if (options.utility_id != null && !canBenchmark && user.org_id !== options.utility_id) {
    return {
      data: [],
      metadata: createToolMetadata({ source: "kpi_values" }),
      error: `Access denied: comparisons are scoped to your own utility only, so utility_id=${options.utility_id} is not available to you.`,
    };
  }

  const accessScope = buildKpiAccessInfo(user);

  const results: MultiUtilityKpiData[] = [];

  for (const reqName of options.kpi_names) {
    const patterns = await resolveKpiPatterns(reqName);

    const filter = sql`report_period_id = ANY(${intArrayParam(periodIds)})
      AND kpi_name ILIKE ANY(${sql.param(patterns)}::text[])`;

    const result = await db.execute(sql`
      SELECT kpi_name, actual_value, utility_name, report_date
      FROM gold.fact_kpi
      WHERE ${filter}
      ${options.utility_id != null ? sql`AND utility_id = ${options.utility_id}` : sql``}
      LIMIT 200
    `);

    const rows = result.rows as Array<{
      kpi_name: string;
      actual_value: string | null;
      utility_name: string;
      report_date: string;
    }>;

    const values: MultiUtilityKpiValue[] = rows
      .map((r) => {
        const val = r.actual_value ? parseFloat(r.actual_value) : NaN;
        if (isNaN(val)) return null;
        return { utility_name: r.utility_name ?? "N/A", kpi_name: r.kpi_name, value: Math.round(val * 100) / 100, rank: 0 };
      })
      .filter((v): v is MultiUtilityKpiValue => v != null)
      .sort((a, b) => a.value - b.value);

    values.forEach((v, i) => { v.rank = i + 1; });

    const matchedKpiNames = [...new Set(rows.map((r) => r.kpi_name))];

    results.push({
      values,
      kpi_name: reqName,
      matched_kpi_names: matchedKpiNames,
      utility_count: values.length,
      report_period: rows[0]?.report_date?.toString() ?? null,
      access: accessScope,
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
  _user: CurrentUser,
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
