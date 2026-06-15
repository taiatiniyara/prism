import { executeDaxOnDataset, listDatasets, getDatasetSchema, getReportPages, type DatasetInfo, type TableInfo, type PowerBiQueryResult, type ReportPage } from "@/lib/powerbi.service";
import { createToolMetadata } from "./common";
import { withCache } from "../cache";
import type { AiToolResult } from "../types";

export interface DiagnosticData {
  ok: boolean;
  datasets_accessible: boolean;
  message: string;
}

export const diagnosePowerBi = async (): Promise<AiToolResult<DiagnosticData>> => {
  try {
    const datasets = await listDatasets();
    return {
      data: {
        ok: true,
        datasets_accessible: true,
        message: `Connected. ${datasets.length} dataset(s) found: ${datasets.map((d) => `${d.name} (${d.id})`).join(", ")}`,
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

    const result: PowerBiQueryResult = await executeDaxOnDataset(
      options.custom_dax,
      options.dataset_id,
    );

    return {
      data: {
        rows: result.rows.slice(0, 500),
        columns: result.columns,
        row_count: result.rows.length,
        query_summary: options.dataset_id
          ? `DAX query on dataset ${options.dataset_id}`
          : "DAX query on default dataset",
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
