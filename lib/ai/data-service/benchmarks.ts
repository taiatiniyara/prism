import type { AiToolResult } from "../types";
import { createToolMetadata } from "./common";

export interface IndustryBenchmark {
  kpi_name: string;
  category: string;
  description: string;
  unit: string;
  direction: "lower_is_better" | "higher_is_better";
  developing_nation_benchmark: number | null;
  developed_nation_benchmark: number | null;
  pacific_regional_average: number | null;
  ppa_target: number | null;
  source: string;
}

const BENCHMARKS: IndustryBenchmark[] = [
  {
    kpi_name: "SAIDI",
    category: "Customer / Reliability",
    description: "System Average Interruption Duration Index — average minutes of outage per customer per year",
    unit: "minutes",
    direction: "lower_is_better",
    developing_nation_benchmark: 3000,
    developed_nation_benchmark: 150,
    pacific_regional_average: 1800,
    ppa_target: 360,
    source: "World Bank RURA 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "SAIFI",
    category: "Customer / Reliability",
    description: "System Average Interruption Frequency Index — average number of interruptions per customer per year",
    unit: "interruptions",
    direction: "lower_is_better",
    developing_nation_benchmark: 50,
    developed_nation_benchmark: 1.5,
    pacific_regional_average: 30,
    ppa_target: 10,
    source: "World Bank RURA 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "System Loss",
    category: "Operations",
    description: "Total system losses (technical + non-technical) as percentage of generation",
    unit: "%",
    direction: "lower_is_better",
    developing_nation_benchmark: 20,
    developed_nation_benchmark: 6,
    pacific_regional_average: 15,
    ppa_target: 12,
    source: "ADB Energy Sector Assessment 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "Technical Loss",
    category: "Operations",
    description: "Technical losses in transmission and distribution as percentage of generation",
    unit: "%",
    direction: "lower_is_better",
    developing_nation_benchmark: 12,
    developed_nation_benchmark: 4,
    pacific_regional_average: 8,
    ppa_target: 8,
    source: "ADB Energy Sector Assessment 2024",
  },
  {
    kpi_name: "Non-Technical Loss",
    category: "Operations",
    description: "Commercial/collection losses as percentage of generation",
    unit: "%",
    direction: "lower_is_better",
    developing_nation_benchmark: 10,
    developed_nation_benchmark: 2,
    pacific_regional_average: 7,
    ppa_target: 4,
    source: "ADB Energy Sector Assessment 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "Generation Capacity Factor",
    category: "Operations",
    description: "Actual generation output as percentage of maximum possible output",
    unit: "%",
    direction: "higher_is_better",
    developing_nation_benchmark: 45,
    developed_nation_benchmark: 70,
    pacific_regional_average: 50,
    ppa_target: 60,
    source: "IRENA Renewable Energy Statistics 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "Tariff Recovery",
    category: "Financial",
    description: "Percentage of operating costs recovered through tariffs",
    unit: "%",
    direction: "higher_is_better",
    developing_nation_benchmark: 80,
    developed_nation_benchmark: 110,
    pacific_regional_average: 85,
    ppa_target: 100,
    source: "ADB Pacific Energy Update 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "Collection Efficiency",
    category: "Financial",
    description: "Percentage of billed revenue actually collected",
    unit: "%",
    direction: "higher_is_better",
    developing_nation_benchmark: 75,
    developed_nation_benchmark: 98,
    pacific_regional_average: 82,
    ppa_target: 90,
    source: "World Bank Doing Business 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "Debt Service Coverage",
    category: "Financial",
    description: "Ratio of operating income to debt service obligations",
    unit: "ratio",
    direction: "higher_is_better",
    developing_nation_benchmark: 1.0,
    developed_nation_benchmark: 2.0,
    pacific_regional_average: 1.2,
    ppa_target: 1.5,
    source: "ADB Pacific Energy Update 2024",
  },
  {
    kpi_name: "Electrification Rate",
    category: "Development",
    description: "Percentage of households with electricity access",
    unit: "%",
    direction: "higher_is_better",
    developing_nation_benchmark: 60,
    developed_nation_benchmark: 99.9,
    pacific_regional_average: 75,
    ppa_target: 90,
    source: "World Bank SE4ALL Database 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "Renewable Penetration",
    category: "Development",
    description: "Percentage of generation from renewable sources",
    unit: "%",
    direction: "higher_is_better",
    developing_nation_benchmark: 20,
    developed_nation_benchmark: 40,
    pacific_regional_average: 30,
    ppa_target: 50,
    source: "IRENA 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "Operating Ratio",
    category: "Financial",
    description: "Operating expenses as percentage of operating revenue",
    unit: "%",
    direction: "lower_is_better",
    developing_nation_benchmark: 85,
    developed_nation_benchmark: 60,
    pacific_regional_average: 78,
    ppa_target: 70,
    source: "ADB Pacific Energy Update 2024, PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "Customer Connection",
    category: "Customer",
    description: "Number of new customer connections per year per 1000 population",
    unit: "connections/1000",
    direction: "higher_is_better",
    developing_nation_benchmark: 5,
    developed_nation_benchmark: 15,
    pacific_regional_average: 8,
    ppa_target: 12,
    source: "PPA Benchmarking Report 2023",
  },
  {
    kpi_name: "Staff per Customer",
    category: "Operations",
    description: "Number of staff per 1000 customers — measures operational efficiency",
    unit: "staff/1000",
    direction: "lower_is_better",
    developing_nation_benchmark: 15,
    developed_nation_benchmark: 3,
    pacific_regional_average: 10,
    ppa_target: 8,
    source: "PPA Benchmarking Report 2023",
  },
];

export interface BenchmarkData {
  benchmarks: IndustryBenchmark[];
  categories: Record<string, IndustryBenchmark[]>;
}

export const getIndustryBenchmarks = async (
): Promise<AiToolResult<BenchmarkData>> => {
  const categories: Record<string, IndustryBenchmark[]> = {};
  for (const b of BENCHMARKS) {
    const arr = categories[b.category] ?? [];
    arr.push(b);
    categories[b.category] = arr;
  }

  return {
    data: { benchmarks: BENCHMARKS, categories },
    metadata: createToolMetadata({ source: "industry_reference", freshness: new Date("2024-01-01") }),
  };
};

export interface ExecutiveDigestData {
  utility_name: string;
  period: string;
  overview: string;
  key_metrics: Array<{
    label: string;
    value: string;
    trend: "up" | "down" | "flat";
    status: "good" | "warning" | "critical";
  }>;
  top_actions: string[];
  risks: string[];
  data_completeness_pct: number;
  benchmark_context: string;
}

export const getExecutiveDigest = async (
): Promise<AiToolResult<ExecutiveDigestData>> => {
  return {
    data: {
      utility_name: "Your Utility",
      period: "Latest Period",
      overview: "Use get_kpi_status, get_scorecard_summary, and get_risk_assessment to populate this digest. Key metrics will auto-populate based on your utility's data.",
      key_metrics: [
        { label: "Scorecard Score", value: "Pending", trend: "flat", status: "warning" },
        { label: "Completion Rate", value: "Query status", trend: "flat", status: "warning" },
        { label: "Approved KPIs", value: "Query status", trend: "flat", status: "warning" },
        { label: "Review Queue", value: "Query review", trend: "flat", status: "warning" },
      ],
      top_actions: ["Query get_review_queue for pending approvals", "Query get_kpi_diagnostics for stale/error KPIs", "Query get_risk_assessment for risk profile"],
      risks: ["Query get_risk_assessment for risk flags", "Query get_compliance_status for compliance issues"],
      data_completeness_pct: 0,
      benchmark_context: "Query get_industry_benchmarks for regional standards and targets.",
    },
    metadata: createToolMetadata({ source: "executive_digest", freshness: new Date() }),
  };
};
