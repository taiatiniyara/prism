import type { CurrentUser } from "@/lib/user.service";
import type { AiToolResult } from "../types";
import { createToolMetadata } from "./common";
import { compareKpisAcrossUtilities } from "./advanced";
import { getIndustryBenchmarks } from "./benchmarks";

/**
 * get_benchmark_report_data — one call that gathers everything a fleet-wide
 * benchmark report needs, so the model stops making ~10 sequential tool
 * round-trips (docs/ai-benchmark-report-tool-spec.md). Composed from the proven,
 * access-scoped compareKpisAcrossUtilities (current + prior FY, in parallel) +
 * getIndustryBenchmarks (ai_benchmark: direction / ppa_target / pacific average),
 * rather than new gold SQL — so the ranking/scoping math is the reviewed path.
 *
 * Direction (best/worst, most-improved) comes from ai_benchmark.direction; a KPI
 * with no benchmark row returns its per-utility values but no best/worst claim
 * (noted) — never a guessed direction (§4, #3's ruling).
 *
 * The full per-KPI ranking tables are returned under `tables` (keyed, pre-sorted,
 * row-capped) for the report block's `table_ref` to reference; the tool's
 * toModelOutput hands the model only a digest, so full rows never enter context.
 */

const DEFAULT_KPI_NAMES = [
  "SAIDI",
  "SAIFI",
  "System Losses",
  "Operating Cost Recovery",
  "Renewable Energy to Grid",
  "Electrification Rate",
];

const MAX_TABLE_ROWS = 100;

export interface BenchmarkReportUtility {
  utility_name: string;
  acronym: string;
}

export interface BenchmarkReportPerUtility {
  acronym: string;
  utility_name: string;
  value: number;
  target: number | null;
  meets_target: boolean | null;
  prior_year_value: number | null;
}

export interface BenchmarkReportKpi {
  kpi_name: string;
  unit: string | null;
  direction: "higher_is_better" | "lower_is_better" | null;
  pacific_avg: number | null;
  ppa_target: number | null;
  per_utility: BenchmarkReportPerUtility[];
  best: { acronym: string; value: number } | null;
  worst: { acronym: string; value: number } | null;
  most_improved: { acronym: string; delta: number } | null;
}

export interface BenchmarkReportTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface BenchmarkReportData {
  fiscal_year: number | null;
  utilities: BenchmarkReportUtility[];
  kpis: BenchmarkReportKpi[];
  tables: Record<string, BenchmarkReportTable>;
  notes: string[];
}

export interface BenchmarkReportOptions {
  fiscal_year?: string | number | null;
  kpi_names?: string[] | null;
  include_prior_year?: boolean;
}

const parseYear = (v: unknown): number | null => {
  if (v == null) return null;
  const m = String(v).match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Normalize a KPI name for fuzzy matching against ai_benchmark.kpi_name. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A safe key for a KPI's ranking table (e.g. "ranking_saidi"). */
const tableKey = (kpiName: string): string =>
  `ranking_${norm(kpiName).replace(/\s+/g, "_")}`.slice(0, 60);

export const getBenchmarkReportData = async (
  user: CurrentUser,
  options: BenchmarkReportOptions,
): Promise<AiToolResult<BenchmarkReportData>> => {
  const notes: string[] = [];
  const kpiNames =
    options.kpi_names && options.kpi_names.length > 0
      ? options.kpi_names
      : DEFAULT_KPI_NAMES;
  const includePrior = options.include_prior_year !== false;
  const year = parseYear(options.fiscal_year); // null → latest, resolved downstream

  // Gather in parallel: current-FY comparison, prior-FY comparison, benchmarks.
  const [current, prior, benchmarks] = await Promise.all([
    compareKpisAcrossUtilities(user, { kpi_names: kpiNames, year, all_utilities: true }),
    includePrior && year != null
      ? compareKpisAcrossUtilities(user, { kpi_names: kpiNames, year: year - 1, all_utilities: true })
      : Promise.resolve(null),
    getIndustryBenchmarks(),
  ]);

  if (current.error) {
    return { data: emptyData(year), metadata: createToolMetadata({ source: "kpi_values" }), error: current.error };
  }

  // Index benchmarks by normalized name for direction / target / pacific avg.
  const benchByNorm = new Map<string, (typeof benchmarks.data.benchmarks)[number]>();
  for (const b of benchmarks.data.benchmarks) benchByNorm.set(norm(b.kpi_name), b);
  const matchBenchmark = (kpiName: string) => {
    const n = norm(kpiName);
    if (benchByNorm.has(n)) return benchByNorm.get(n)!;
    // loose contains-match either direction (fact name vs benchmark name differ)
    for (const [bn, b] of benchByNorm) {
      if (bn.includes(n) || n.includes(bn)) return b;
    }
    return null;
  };

  // Prior-year value lookup: kpi(reqName) → acronym → value.
  const priorByKpiAcronym = new Map<string, Map<string, number>>();
  for (const k of prior?.data ?? []) {
    const m = new Map<string, number>();
    for (const v of k.values) m.set(v.utility_acronym, v.value);
    priorByKpiAcronym.set(k.kpi_name, m);
  }

  const utilityMap = new Map<string, BenchmarkReportUtility>();
  const kpis: BenchmarkReportKpi[] = [];
  const tables: Record<string, BenchmarkReportTable> = {};
  let resolvedYear = year;

  for (const k of current.data) {
    if (k.report_period && resolvedYear == null) {
      resolvedYear = parseYear(k.report_period);
    }
    const bench = matchBenchmark(k.kpi_name);
    const direction = bench?.direction ?? null;
    const target = bench?.ppa_target ?? null;
    const pacificAvg = bench?.pacific_regional_average ?? null;
    const unit = bench?.unit ?? null;
    if (!direction) {
      notes.push(`No benchmark direction for "${k.kpi_name}" — values shown, but best/worst omitted.`);
    }

    const priorMap = priorByKpiAcronym.get(k.kpi_name);
    const perUtility: BenchmarkReportPerUtility[] = k.values.map((v) => {
      utilityMap.set(v.utility_acronym, {
        utility_name: v.utility_name,
        acronym: v.utility_acronym,
      });
      const priorVal = priorMap?.get(v.utility_acronym) ?? null;
      const meets =
        target != null && direction != null
          ? direction === "lower_is_better"
            ? v.value <= target
            : v.value >= target
          : null;
      return {
        acronym: v.utility_acronym,
        utility_name: v.utility_name,
        value: v.value,
        target,
        meets_target: meets,
        prior_year_value: priorVal,
      };
    });

    // Direction-aware best/worst (skip when no direction).
    let best: BenchmarkReportKpi["best"] = null;
    let worst: BenchmarkReportKpi["worst"] = null;
    let mostImproved: BenchmarkReportKpi["most_improved"] = null;
    if (direction && perUtility.length > 0) {
      const lowerBetter = direction === "lower_is_better";
      const sorted = [...perUtility].sort((a, b) =>
        lowerBetter ? a.value - b.value : b.value - a.value,
      );
      best = { acronym: sorted[0].acronym, value: sorted[0].value };
      worst = {
        acronym: sorted[sorted.length - 1].acronym,
        value: sorted[sorted.length - 1].value,
      };
      // Most improved = biggest FAVOURABLE prior→current delta.
      for (const u of perUtility) {
        if (u.prior_year_value == null) continue;
        const raw = u.value - u.prior_year_value;
        const favourable = lowerBetter ? -raw : raw; // improvement magnitude
        if (favourable > 0 && (!mostImproved || favourable > mostImproved.delta)) {
          mostImproved = { acronym: u.acronym, delta: round2(favourable) };
        }
      }
    }

    // pacific_avg: prefer the benchmark's regional average; else mean of values.
    const meanOfValues =
      perUtility.length > 0
        ? round2(perUtility.reduce((s, u) => s + u.value, 0) / perUtility.length)
        : null;

    kpis.push({
      kpi_name: k.kpi_name,
      unit,
      direction,
      pacific_avg: pacificAvg ?? meanOfValues,
      ppa_target: target,
      per_utility: perUtility,
      best,
      worst,
      most_improved: mostImproved,
    });

    // Ranking table (pre-sorted best→worst when direction known, else as-returned).
    const orderedForTable =
      direction != null
        ? [...perUtility].sort((a, b) =>
            direction === "lower_is_better" ? a.value - b.value : b.value - a.value,
          )
        : perUtility;
    const unitLabel = unit ? ` (${unit})` : "";
    const valueCol = `${k.kpi_name}${unitLabel}`;
    tables[tableKey(k.kpi_name)] = {
      columns: includePrior
        ? ["Utility", valueCol, "Prior year", "Target", "Meets target"]
        : ["Utility", valueCol, "Target", "Meets target"],
      rows: orderedForTable.slice(0, MAX_TABLE_ROWS).map((u) => {
        const row: Record<string, unknown> = {
          Utility: u.acronym,
          [valueCol]: u.value,
          Target: u.target ?? "—",
          "Meets target": u.meets_target == null ? "—" : u.meets_target ? "Yes" : "No",
        };
        if (includePrior) row["Prior year"] = u.prior_year_value ?? "—";
        return row;
      }),
    };
  }

  if (kpis.length === 0) {
    notes.push("No KPI data found for the requested fiscal year and metrics.");
  }
  if (includePrior && year == null) {
    notes.push("Prior-year comparison needs an explicit fiscal year; most-improved omitted.");
  }

  return {
    data: {
      fiscal_year: resolvedYear,
      utilities: [...utilityMap.values()].sort((a, b) => a.acronym.localeCompare(b.acronym)),
      kpis,
      tables,
      notes,
    },
    metadata: createToolMetadata({ freshness: new Date(), source: "kpi_values" }),
  };
};

const emptyData = (year: number | null): BenchmarkReportData => ({
  fiscal_year: year,
  utilities: [],
  kpis: [],
  tables: {},
  notes: [],
});

/**
 * Digest for the model (tool toModelOutput): everything needed to WRITE the
 * report — but tables are summarised to headline stats + a few rows, never the
 * full row set (which stays server-side for table_ref resolution).
 */
export function benchmarkReportDigest(data: BenchmarkReportData) {
  return {
    fiscal_year: data.fiscal_year,
    utility_count: data.utilities.length,
    utilities: data.utilities.map((u) => u.acronym),
    kpis: data.kpis.map((k) => ({
      kpi_name: k.kpi_name,
      unit: k.unit,
      direction: k.direction,
      pacific_avg: k.pacific_avg,
      ppa_target: k.ppa_target,
      best: k.best,
      worst: k.worst,
      most_improved: k.most_improved,
      utility_count: k.per_utility.length,
      table_ref: tableKey(k.kpi_name),
    })),
    tables: Object.fromEntries(
      Object.entries(data.tables).map(([key, t]) => [
        key,
        {
          columns: t.columns,
          row_count: t.rows.length,
          sample_rows: t.rows.slice(0, 3),
        },
      ]),
    ),
    notes: data.notes,
    guidance:
      "Write the report from these stats. In each section's data_table use { table_ref: \"<the kpi's table_ref>\" } — do NOT re-type the rows; the server fills them.",
  };
}
