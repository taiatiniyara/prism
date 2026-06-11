import { executeDaxOnDataset, listDatasets, getDatasetSchema, getReportPages, getReportVisuals, exportReportVisual, type DatasetInfo, type TableInfo, type PowerBiQueryResult, type ReportPage, type ReportVisual } from "@/lib/powerbi.service";
import { createToolMetadata } from "./common";
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
    const datasets = await listDatasets();
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
}

export const discoverSchema = async (
  options: { dataset_id?: string } = {},
): Promise<AiToolResult<SchemaData>> => {
  try {
    const tables = await getDatasetSchema(options.dataset_id);
    return {
      data: { dataset_id: options.dataset_id || "default", tables },
      metadata: createToolMetadata({ source: "powerbi", freshness: new Date() }),
    };
  } catch (err) {
    return {
      data: { dataset_id: options.dataset_id || "default", tables: [] },
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
        error: "Use discover_datasets to find available datasets, discover_schema to see tables/columns/measures, then query with a custom DAX query like EVALUATE table_name or EVALUATE SUMMARIZECOLUMNS(...)",
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
    const pages = await getReportPages(options.report_id);
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

export interface VisualData {
  visuals: ReportVisual[];
  page_name: string;
}

export const discoverVisuals = async (
  options: { page_name: string; report_id?: string },
): Promise<AiToolResult<VisualData>> => {
  try {
    const visuals = await getReportVisuals(options.page_name, options.report_id);
    return {
      data: { visuals, page_name: options.page_name },
      metadata: createToolMetadata({ source: "powerbi", freshness: new Date() }),
    };
  } catch (err) {
    return {
      data: { visuals: [], page_name: options.page_name },
      metadata: createToolMetadata({ source: "powerbi" }),
      error: err instanceof Error ? err.message : "Failed to get visuals",
    };
  }
};

export interface ExportData {
  data_json: string;
  visual_name: string;
  page_name: string;
}

export const queryVisual = async (
  options: { page_name: string; visual_name: string; report_id?: string },
): Promise<AiToolResult<ExportData>> => {
  try {
    const data = await exportReportVisual(options.page_name, options.visual_name, options.report_id);
    return {
      data: { data_json: data.slice(0, 50000), visual_name: options.visual_name, page_name: options.page_name },
      metadata: createToolMetadata({ source: "powerbi", freshness: new Date() }),
    };
  } catch (err) {
    return {
      data: { data_json: "", visual_name: options.visual_name, page_name: options.page_name },
      metadata: createToolMetadata({ source: "powerbi" }),
      error: err instanceof Error ? err.message : "Failed to export visual data",
    };
  }
};
