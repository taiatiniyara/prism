/**
 * Power BI AI Enrichment
 *
 * Caching, smart parameter inference, data freshness, anomaly detection,
 * dashboard deep links, export, and NL query resolution.
 */

import { getEnv, getAzureToken, isConfigured, type PowerBiConfig } from "@/lib/powerbi.service";
import { PBI_QUERIES, resolveQueryFromNL } from "./pbi-queries";
import type { AiToolResult } from "../types";
import { createToolMetadata } from "./common";

// ═══════════════════════════════════════════════
// SMART PARAMETER CONTEXT
// ═══════════════════════════════════════════════

export interface PbiContext {
  utility?: string;
  fy?: string;
  country?: string;
  lastUsed?: number;
}

const sessionContexts = new Map<number, PbiContext>();

export function setPbiContext(sessionId: number, ctx: Partial<PbiContext>): PbiContext {
  const current = sessionContexts.get(sessionId) ?? {};
  const updated = { ...current, ...ctx, lastUsed: Date.now() };
  sessionContexts.set(sessionId, updated);
  return updated;
}

export function getPbiContext(sessionId: number): PbiContext {
  const context = sessionContexts.get(sessionId);
  if (!context) return {};

  const now = Date.now();
  if (context.lastUsed && now - context.lastUsed > 300_000) {
    sessionContexts.delete(sessionId);
    return {};
  }
  return { ...context };
}

export function clearPbiContext(sessionId?: number): void {
  if (sessionId !== undefined) {
    sessionContexts.delete(sessionId);
  } else {
    sessionContexts.clear();
  }
}

/** Merge context defaults into query params, filling in missing required params. */
export function applyContextDefaults(
  templateName: string,
  providedParams: Record<string, string> | undefined,
  sessionId: number,
): { params: Record<string, string>; filled: string[] } {
  const template = PBI_QUERIES[templateName];
  const params = { ...providedParams };
  const filled: string[] = [];
  const ctx = getPbiContext(sessionId);

  if (template) {
    for (const [key, def] of Object.entries(template.params)) {
      if (!params[key] && def.required) {
        if (key === "utility" && ctx.utility) { params[key] = ctx.utility; filled.push(key); }
        if (key === "fy" && ctx.fy) { params[key] = ctx.fy; filled.push(key); }
      }
    }
  }

  return { params, filled };
}

// ═══════════════════════════════════════════════
// QUERY RESULT CACHING
// ═══════════════════════════════════════════════

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const resultCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 300_000; // 5 minutes

export function getCachedResult(cacheKey: string): unknown | null {
  const entry = resultCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    resultCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

export function setCachedResult(cacheKey: string, data: unknown): void {
  resultCache.set(cacheKey, { data, timestamp: Date.now() });
  if (resultCache.size > 500) {
    const oldest = [...resultCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) resultCache.delete(oldest[0]);
  }
}

export function clearResultCache(): void {
  resultCache.clear();
}

export function buildCacheKey(query: string, params?: Record<string, string>): string {
  return `pbi:cache:${query}:${JSON.stringify(params || {})}`;
}

// ═══════════════════════════════════════════════
// DATA FRESHNESS
// ═══════════════════════════════════════════════

export interface FreshnessData {
  configured: boolean;
  last_refresh?: string;
  refresh_status?: string;
  message: string;
}

export async function getFreshnessStatus(): Promise<AiToolResult<FreshnessData>> {
  if (!isConfigured()) {
    return {
      data: { configured: false, message: "Power BI is not configured." },
      metadata: createToolMetadata({ source: "powerbi_freshness" }),
    };
  }

  try {
    const config = (await getEnv()) as PowerBiConfig | null;
    if (!config?.workspaceID || !config?.datasetId) {
      return {
        data: { configured: true, message: "Power BI is configured but workspace/dataset details are incomplete." },
        metadata: createToolMetadata({ source: "powerbi_freshness" }),
      };
    }

    const token = await getAzureToken();
    const bearer = `${token.token_type} ${token.access_token}`;
    const url = `https://api.powerbi.com/v1.0/myorg/groups/${config.workspaceID}/datasets/${config.datasetId}/refreshes?$top=1`;

    const resp = await fetch(url, { headers: { Authorization: bearer } });
    if (!resp.ok) {
      return {
        data: {
          configured: true,
          message: `Unable to check refresh status (HTTP ${resp.status}). The Power BI service may be available but refresh history couldn't be retrieved.`,
        },
        metadata: createToolMetadata({ source: "powerbi_freshness" }),
      };
    }

    const data = await resp.json();
    const refreshes = data.value ?? [];
    if (refreshes.length > 0) {
      const last = refreshes[0];
      return {
        data: {
          configured: true,
          last_refresh: last.endTime || last.startTime,
          refresh_status: last.status,
          message: `Last data refresh: ${last.endTime || last.startTime} (status: ${last.status || "unknown"}).`,
        },
        metadata: createToolMetadata({ source: "powerbi_freshness", freshness: last.endTime ? new Date(last.endTime) : null }),
      };
    }

    return {
      data: { configured: true, message: "No refresh history found. The dataset may not have been refreshed yet, or refresh history is not available." },
      metadata: createToolMetadata({ source: "powerbi_freshness" }),
    };
  } catch (err) {
    return {
      data: { configured: true, message: `Freshness check failed: ${err instanceof Error ? err.message : String(err)}` },
      metadata: createToolMetadata({ source: "powerbi_freshness" }),
    };
  }
}

// ═══════════════════════════════════════════════
// ANOMALY DETECTION
// ═══════════════════════════════════════════════

export interface AnomalyResult {
  column: string;
  utility: string;
  current_value: number;
  average: number;
  std_dev: number;
  z_score: number;
  is_anomaly: boolean;
  direction: "high" | "low" | "normal";
}

export function detectAnomalies(
  rows: Record<string, unknown>[],
  options: { threshold?: number } = {},
): AnomalyResult[] {
  const threshold = options.threshold ?? 2.0;
  const anomalies: AnomalyResult[] = [];

  if (rows.length < 3) return anomalies;

  // Find numeric columns
  const sample = rows[0];
  const numericColumns = Object.keys(sample).filter((k) => typeof sample[k] === "number");

  for (const col of numericColumns) {
    const values = rows.map((r) => r[col] as number).filter((v) => !isNaN(v));
    if (values.length < 3) continue;

    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) continue;

    for (const row of rows) {
      const val = row[col] as number;
      if (isNaN(val)) continue;
      const zScore = (val - avg) / stdDev;
      if (Math.abs(zScore) >= threshold) {
        anomalies.push({
          column: col,
          utility: (row.Utility || row.Utility || "unknown") as string,
          current_value: val,
          average: Math.round(avg * 100) / 100,
          std_dev: Math.round(stdDev * 100) / 100,
          z_score: Math.round(zScore * 100) / 100,
          is_anomaly: true,
          direction: zScore > 0 ? "high" : "low",
        });
      }
    }
  }

  return anomalies;
}

// ═══════════════════════════════════════════════
// NL QUERY RESOLUTION
// ═══════════════════════════════════════════════

export interface NlQueryResult {
  matched: boolean;
  template_name?: string;
  template_description?: string;
  suggested_params?: Record<string, string>;
  confidence: number;
  alternatives?: string[];
}

export function resolveNlQuery(question: string, sessionId?: number): NlQueryResult {
  const match = resolveQueryFromNL(question);

  if (match && match.score > 0.4) {
    const ctx = sessionId !== undefined ? getPbiContext(sessionId) : {};
    const suggestedParams: Record<string, string> = {};
    if (ctx.fy) suggestedParams.fy = ctx.fy;
    if (ctx.utility) suggestedParams.utility = ctx.utility;

    const alternatives = Object.values(PBI_QUERIES)
      .filter((t) => t.name !== match.template.name)
      .map((t) => t.name)
      .slice(0, 5);

    return {
      matched: true,
      template_name: match.template.name,
      template_description: match.template.description,
      suggested_params: suggestedParams,
      confidence: Math.round(match.score * 100) / 100,
      alternatives,
    };
  }

  // No strong match — return all template names as alternatives
  const allNames = Object.values(PBI_QUERIES).map((t) => t.name);
  return {
    matched: false,
    confidence: 0,
    alternatives: allNames.slice(0, 8),
  };
}

// ═══════════════════════════════════════════════
// DASHBOARD DEEP LINKS
// ═══════════════════════════════════════════════

export async function generateDeepLink(
  options: { page_name?: string; filter_utility?: string; filter_fy?: string },
): Promise<AiToolResult<{ url: string | null; message: string }>> {
  try {
    const config = await getEnv();
    if (!config?.embedURL) {
      return {
        data: { url: null, message: "Power BI embed URL is not configured." },
        metadata: createToolMetadata({ source: "powerbi_deeplink" }),
      };
    }

    let url = config.embedURL;
    const params: string[] = [];

    if (options.page_name) {
      params.push(`pageName=${encodeURIComponent(options.page_name)}`);
    }

    // Power BI URL filters use odata-style syntax
    const filters: string[] = [];
    if (options.filter_utility) {
      filters.push(`Utility eq '${options.filter_utility}'`);
    }
    if (options.filter_fy) {
      filters.push(`FY eq '${options.filter_fy}'`);
    }
    if (filters.length > 0) {
      params.push(`$filter=${encodeURIComponent(filters.join(" and "))}`);
    }

    if (params.length > 0) {
      url += (url.includes("?") ? "&" : "?") + params.join("&");
    }

    return {
      data: { url, message: options.page_name ? `Opening ${options.page_name} page` : "Opening Power BI dashboard" },
      metadata: createToolMetadata({ source: "powerbi_deeplink" }),
    };
  } catch (err) {
    return {
      data: { url: null, message: err instanceof Error ? err.message : "Failed to generate deep link" },
      metadata: createToolMetadata({ source: "powerbi_deeplink" }),
    };
  }
}

// ═══════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════

export interface ExportData {
  format: "csv" | "json";
  content: string;
  filename: string;
  row_count: number;
}

export function exportQueryResults(
  rows: Record<string, unknown>[],
  queryName: string,
  format: "csv" | "json" = "csv",
): ExportData {
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `prism_pbi_${queryName}_${timestamp}.${format}`;

  if (format === "json") {
    return {
      format: "json",
      content: JSON.stringify(rows, null, 2),
      filename,
      row_count: rows.length,
    };
  }

  // CSV
  if (rows.length === 0) {
    return { format: "csv", content: "", filename, row_count: 0 };
  }

  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(","),
    ),
  ];

  return {
    format: "csv",
    content: csvRows.join("\n"),
    filename,
    row_count: rows.length,
  };
}

// ═══════════════════════════════════════════════
// QUERY USAGE ANALYTICS
// ═══════════════════════════════════════════════

interface UsageEntry {
  query_name: string;
  timestamp: number;
  success: boolean;
  row_count: number;
  latency_ms: number;
}

const usageLog: UsageEntry[] = [];

export function logQueryUsage(entry: UsageEntry): void {
  usageLog.push(entry);
  if (usageLog.length > 1000) usageLog.shift();
}

export function getQueryUsageStats(): {
  total_queries: number;
  by_query: Record<string, { count: number; success_rate: number; avg_rows: number; avg_latency_ms: number }>;
  recent: UsageEntry[];
} {
  const byQuery: Record<string, { count: number; success: number; total_rows: number; total_latency: number }> = {};

  for (const entry of usageLog) {
    const q = byQuery[entry.query_name] || { count: 0, success: 0, total_rows: 0, total_latency: 0 };
    q.count++;
    if (entry.success) q.success++;
    q.total_rows += entry.row_count;
    q.total_latency += entry.latency_ms;
    byQuery[entry.query_name] = q;
  }

  const by_query: Record<string, { count: number; success_rate: number; avg_rows: number; avg_latency_ms: number }> = {};
  for (const [name, stats] of Object.entries(byQuery)) {
    by_query[name] = {
      count: stats.count,
      success_rate: stats.count > 0 ? Math.round((stats.success / stats.count) * 100) : 0,
      avg_rows: stats.count > 0 ? Math.round(stats.total_rows / stats.count) : 0,
      avg_latency_ms: stats.count > 0 ? Math.round(stats.total_latency / stats.count) : 0,
    };
  }

  return {
    total_queries: usageLog.length,
    by_query,
    recent: usageLog.slice(-20),
  };
}

// ═══════════════════════════════════════════════
// AUTO-CHART RECOMMENDATIONS
// ═══════════════════════════════════════════════

export function recommendChart(
  templateName: string,
  rowCount: number,
): { chart_type: string; title: string; reason: string } {
  const template = PBI_QUERIES[templateName];
  if (!template) {
    return { chart_type: "table", title: "Results", reason: "Unknown template" };
  }

  // Override based on data characteristics
  if (template.result_type === "trend" && rowCount <= 1) {
    return { chart_type: "table", title: template.name.replace(/_/g, " "), reason: "Only one data point — table is clearer than a chart" };
  }

  return {
    chart_type: template.recommended_chart,
    title: template.name.replace(/_/g, " "),
    reason: `This query returns ${template.result_type} data, best shown as a ${template.recommended_chart}`,
  };
}
