import { executeDaxOnDataset, listDatasets, getDatasetSchema, getReportPages, testPowerBiConnection, type DatasetInfo, type TableInfo, type PowerBiQueryResult, type ReportPage } from "@/lib/powerbi.service";
import { createToolMetadata } from "./common";
import { withCache } from "../cache";
import type { AiToolResult } from "../types";
import { sanitizeDax } from "./dax-sanitizer";
import { PBI_SCHEMA, resolveTable, searchSchema, getSchemaSummary, type PbiTable } from "./pbi-schema-registry";
import { PBI_QUERIES, getQueryCatalog, type PbiQueryTemplate } from "./pbi-queries";
import {
  setPbiContext, getPbiContext, clearPbiContext,
  getFreshnessStatus, detectAnomalies,
  resolveNlQuery, generateDeepLink, exportQueryResults,
  logQueryUsage, getQueryUsageStats, recommendChart,
  type FreshnessData, type AnomalyResult, type NlQueryResult, type ExportData,
} from "./pbi-enrichment";
import {
  computeRiskScores, generatePerformanceReport, generateProactiveAlerts,
  generatePeerGroups, getDonorTemplates, generateRenewableScenario,
  type UtilityRiskScore, type AutomatedReport, type ProactiveAlert,
  type IslandPeerGroup, type DonorReportTemplate, type RenewableScenario,
} from "./pbi-insights";
import {
  forecastTrend, findHistoricalExtremes, findSimilarUtilities,
  computeKpiCorrelations, prioritizeInvestments, generateExecutiveBriefing,
  assembleFullReport, scoreDataCompleteness, trackRegulatoryThresholds,
  recommendCapacityBuilding, simulateTariffChange, autoFillDonorApplication,
  projectImpact,
} from "./pbi-advanced";

export interface DiagnosticData {
  ok: boolean;
  datasets_accessible: boolean;
  message: string;
}

export const diagnosePowerBi = async (): Promise<AiToolResult<DiagnosticData>> => {
  try {
    const result = await testPowerBiConnection();
    return {
      data: {
        ok: result.ok,
        datasets_accessible: result.datasets_accessible,
        message: result.message,
      },
      metadata: createToolMetadata({ source: "powerbi_diagnostics" }),
    };
  } catch (err) {
    return {
      data: {
        ok: false,
        datasets_accessible: false,
        message: err instanceof Error ? err.message : "Power BI connection failed",
      },
      metadata: createToolMetadata({ source: "powerbi_diagnostics" }),
    };
  }
};

export interface DiscoveryData {
  datasets: DatasetInfo[];
  total_datasets: number;
}

export const discoverDatasets = async (): Promise<AiToolResult<DiscoveryData>> => {
  try {
    const datasets = await withCache("pbi:datasets", () => listDatasets(), 60000);
    return {
      data: { datasets, total_datasets: datasets.length },
      metadata: createToolMetadata({ source: "powerbi", freshness: new Date() }),
    };
  } catch (err) {
    return {
      data: { datasets: [], total_datasets: 0 },
      metadata: createToolMetadata({ source: "powerbi" }),
      error: err instanceof Error ? err.message : "Failed to list datasets",
    };
  }
};

export interface SchemaData {
  dataset_id: string;
  tables: TableInfo[];
  total_tables: number;
}

export const discoverSchema = async (
  options: { dataset_id?: string; table_names?: string[] } = {},
): Promise<AiToolResult<SchemaData>> => {
  try {
    const cacheKey = `pbi:schema:${options.dataset_id || "default"}:${(options.table_names || []).sort().join(",")}`;
    const tables = await withCache(cacheKey, () => getDatasetSchema(options.dataset_id, options.table_names), 120000);
    return {
      data: { dataset_id: options.dataset_id || "default", tables, total_tables: tables.length },
      metadata: createToolMetadata({ source: "powerbi", freshness: new Date() }),
    };
  } catch (err) {
    return {
      data: { dataset_id: options.dataset_id || "default", tables: [], total_tables: 0 },
      metadata: createToolMetadata({ source: "powerbi" }),
      error: err instanceof Error ? err.message : "Failed to get schema",
    };
  }
};

export interface PowerBiData {
  rows: Record<string, unknown>[];
  columns: string[];
  row_count: number;
  query_summary: string;
}

export const queryPowerBi = async (
  options: {
    query_name?: string;
    custom_dax?: string;
    dataset_id?: string;
  } = {},
): Promise<AiToolResult<PowerBiData>> => {
  try {
    if (!options.custom_dax) {
      return {
        data: { rows: [], columns: [], row_count: 0, query_summary: "" },
        metadata: createToolMetadata({ source: "powerbi" }),
        error: "Use discover_datasets to find available datasets, then write a custom DAX query like EVALUATE table_name or EVALUATE SUMMARIZECOLUMNS(...). Use discover_schema with table_names to explore table structure first.",
      };
    }

    const daxValidation = sanitizeDax(options.custom_dax);
    if (!daxValidation.valid) {
      return {
        data: { rows: [], columns: [], row_count: 0, query_summary: "" },
        metadata: createToolMetadata({ source: "powerbi" }),
        error: daxValidation.reason ?? "DAX query rejected by validator.",
      };
    }

    const cacheKey = `pbi:query:${options.dataset_id || "default"}:${Buffer.from(options.custom_dax).toString("base64").slice(0, 200)}`;

    const result: PowerBiQueryResult = await withCache(
      cacheKey,
      () => executeDaxOnDataset(options.custom_dax!, options.dataset_id),
      15000,
    );

    const actualRowCount = result.rows.length;

    return {
      data: {
        rows: result.rows,
        columns: result.columns,
        row_count: actualRowCount,
        query_summary: options.dataset_id
          ? `DAX query on dataset ${options.dataset_id}. Returned ${actualRowCount} rows.`
          : `DAX query on default dataset. Returned ${actualRowCount} rows.`,
      },
      metadata: createToolMetadata({ freshness: new Date(), source: "powerbi" }),
    };
  } catch (err) {
    return {
      data: { rows: [], columns: [], row_count: 0, query_summary: "" },
      metadata: createToolMetadata({ source: "powerbi" }),
      error: err instanceof Error ? err.message : "Power BI query failed",
    };
  }
};

export interface ReportData {
  pages: ReportPage[];
  report_id: string;
}

export const discoverReport = async (
  options: { report_id?: string } = {},
): Promise<AiToolResult<ReportData>> => {
  try {
    const cacheKey = `pbi:report:${options.report_id || "default"}`;
    const pages = await withCache(cacheKey, () => getReportPages(options.report_id), 120000);
    return {
      data: { pages, report_id: options.report_id || "default" },
      metadata: createToolMetadata({ source: "powerbi", freshness: new Date() }),
    };
  } catch (err) {
    return {
      data: { pages: [], report_id: options.report_id || "default" },
      metadata: createToolMetadata({ source: "powerbi" }),
      error: err instanceof Error ? err.message : "Failed to get report pages",
    };
  }
};

// ── Schema Registry Tools (instant, no API call) ──

export interface PbiSchemaData {
  summary: string;
  table_count: number;
  tables: Array<{ name: string; columns: PbiTable["columns"]; measures: PbiTable["measures"]; description: string }>;
}

export const getPbiSchema = async (
  options: { table_name?: string; search?: string } = {},
): Promise<AiToolResult<PbiSchemaData>> => {
  const dataset = PBI_SCHEMA.datasets["prism-dashboards-prod"];
  if (!dataset) {
    return {
      data: { summary: "", table_count: 0, tables: [] },
      metadata: createToolMetadata({ source: "powerbi_schema" }),
      error: "No Power BI schema available",
    };
  }

  if (options.search) {
    const results = searchSchema(options.search);
    const tables = results
      .map((r) => dataset.tables[r.table])
      .filter(Boolean)
      .map((t) => ({ name: t.name, columns: t.columns, measures: t.measures, description: t.description }));
    return {
      data: { summary: `Search results for "${options.search}": ${results.length} tables matched.`, table_count: tables.length, tables },
      metadata: createToolMetadata({ source: "powerbi_schema" }),
    };
  }

  if (options.table_name) {
    const table = resolveTable(options.table_name);
    if (!table) {
      return {
        data: { summary: `Table "${options.table_name}" not found. Try pbi_schema without table_name to see all tables.`, table_count: 0, tables: [] },
        metadata: createToolMetadata({ source: "powerbi_schema" }),
      };
    }
    return {
      data: { summary: table.description, table_count: 1, tables: [{ name: table.name, columns: table.columns, measures: table.measures, description: table.description }] },
      metadata: createToolMetadata({ source: "powerbi_schema" }),
    };
  }

  const allTables = Object.values(dataset.tables).map((t) => ({
    name: t.name,
    columns: t.columns,
    measures: t.measures,
    description: t.description,
  }));

  return {
    data: { summary: getSchemaSummary(), table_count: allTables.length, tables: allTables },
    metadata: createToolMetadata({ source: "powerbi_schema" }),
  };
};

// ── Pre-built Query Tool ──

export interface PbiQueryData {
  rows: Record<string, unknown>[];
  columns: string[];
  row_count: number;
  query_name: string;
  dax_executed: string;
}

export const getQueryCatalogData = async (): Promise<AiToolResult<{ catalog: string; count: number }>> => {
  const catalog = getQueryCatalog();
  const count = Object.keys(PBI_QUERIES).length;
  return {
    data: { catalog, count },
    metadata: createToolMetadata({ source: "powerbi_queries" }),
  };
};

export const runPbiQuery = async (
  options: { query: string; params?: Record<string, string> },
): Promise<AiToolResult<PbiQueryData>> => {
  const template: PbiQueryTemplate | undefined = PBI_QUERIES[options.query];
  if (!template) {
    return {
      data: { rows: [], columns: [], row_count: 0, query_name: options.query, dax_executed: "" },
      metadata: createToolMetadata({ source: "powerbi_queries" }),
      error: `Unknown query "${options.query}". Available: ${Object.keys(PBI_QUERIES).join(", ")}. Use pbi_query_catalog to see descriptions.`,
    };
  }

  // Validate required params
  const missingParams = Object.entries(template.params)
    .filter(([, v]) => v.required)
    .filter(([k]) => !options.params?.[k])
    .map(([k]) => k);

  if (missingParams.length > 0) {
    return {
      data: { rows: [], columns: [], row_count: 0, query_name: options.query, dax_executed: "" },
      metadata: createToolMetadata({ source: "powerbi_queries" }),
      error: `Missing required parameters: ${missingParams.join(", ")}. ${template.description}`,
    };
  }

  const params = options.params || {};
  const dax = template.dax(params);

  const daxValidation = sanitizeDax(dax);
  if (!daxValidation.valid) {
    return {
      data: { rows: [], columns: [], row_count: 0, query_name: options.query, dax_executed: dax },
      metadata: createToolMetadata({ source: "powerbi_queries" }),
      error: `DAX query rejected by validator: ${daxValidation.reason}`,
    };
  }

  try {
    const result: PowerBiQueryResult = await withCache(
      `pbi:query:${options.query}:${JSON.stringify(params)}`,
      () => executeDaxOnDataset(dax),
      15000,
    );

    return {
      data: {
        rows: result.rows,
        columns: result.columns,
        row_count: result.rows.length,
        query_name: options.query,
        dax_executed: dax,
      },
      metadata: createToolMetadata({ freshness: new Date(), source: "powerbi_queries" }),
    };
  } catch (err) {
    return {
      data: { rows: [], columns: [], row_count: 0, query_name: options.query, dax_executed: dax },
      metadata: createToolMetadata({ source: "powerbi_queries" }),
      error: err instanceof Error ? err.message : "Power BI query failed",
    };
  }
};

// ── Enrichment Wrappers ──

export { setPbiContext, getPbiContext, clearPbiContext };
export { getFreshnessStatus };
export { resolveNlQuery, generateDeepLink, exportQueryResults };
export { logQueryUsage, getQueryUsageStats, recommendChart };
export { detectAnomalies };
export type { FreshnessData, AnomalyResult, NlQueryResult, ExportData };

// ── Insights Wrappers ──

export { computeRiskScores, generatePerformanceReport, generateProactiveAlerts, generatePeerGroups, getDonorTemplates, generateRenewableScenario };
export type { UtilityRiskScore, AutomatedReport, ProactiveAlert, IslandPeerGroup, DonorReportTemplate, RenewableScenario };

// ── Advanced Analytics Wrappers ──

export { forecastTrend, findHistoricalExtremes, findSimilarUtilities };
export { computeKpiCorrelations, prioritizeInvestments, generateExecutiveBriefing };
export { assembleFullReport, scoreDataCompleteness, trackRegulatoryThresholds };
export { recommendCapacityBuilding, simulateTariffChange, autoFillDonorApplication };
export { projectImpact };
