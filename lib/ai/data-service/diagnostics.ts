import { listReviewKpiRows } from "@/app/data-entry/review-kpi/service";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface KpiDiagnostic {
  name: string;
  status: string;
  has_unresolved_comments: boolean;
}

export interface KpiDiagnosticsData {
  status_counts: Record<string, number>;
  missing_input_kpis: KpiDiagnostic[];
  error_kpis: KpiDiagnostic[];
  stale_kpis: KpiDiagnostic[];
  unresolved_comments_count: number;
  total_kpis_in_scope: number;
}

export const getKpiDiagnostics = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
  } = {},
): Promise<AiToolResult<KpiDiagnosticsData>> => {
  if (!options.report_period_id) {
    return {
      data: {
        status_counts: {},
        missing_input_kpis: [],
        error_kpis: [],
        stale_kpis: [],
        unresolved_comments_count: 0,
        total_kpis_in_scope: 0,
      },
      metadata: createToolMetadata({
        completeness_pct: 0,
        source: "review_kpi",
      }),
      error: "No report period specified",
    };
  }

  const rows = await listReviewKpiRows({
    reportTypeId: null,
    reportPeriodId: options.report_period_id,
    kpiCategoryId: null,
    kpiSubcategoryId: null,
    serviceAreaId: null,
  });

  const statusCounts = rows.reduce(
    (acc, row) => {
      acc[row.result.status] = (acc[row.result.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const missingInputKpis: KpiDiagnostic[] = rows
    .filter((row) => row.result.status === "missing-input")
    .slice(0, 10)
    .map((row) => ({
      name: row.kpiName,
      status: row.result.status,
      has_unresolved_comments: row.inputs.some((input) =>
        input.comments.some((c) => c.resolved !== true),
      ),
    }));

  const errorKpis: KpiDiagnostic[] = rows
    .filter((row) => row.result.status === "error")
    .slice(0, 10)
    .map((row) => ({
      name: row.kpiName,
      status: row.result.status,
      has_unresolved_comments: row.inputs.some((input) =>
        input.comments.some((c) => c.resolved !== true),
      ),
    }));

  const staleKpis: KpiDiagnostic[] = rows
    .filter((row) => row.result.status === "stale")
    .slice(0, 10)
    .map((row) => ({
      name: row.kpiName,
      status: row.result.status,
      has_unresolved_comments: row.inputs.some((input) =>
        input.comments.some((c) => c.resolved !== true),
      ),
    }));

  const unresolvedCommentsCount = rows.filter((row) =>
    row.inputs.some((input) =>
      input.comments.some((c) => c.resolved !== true),
    ),
  ).length;

  return {
    data: {
      status_counts: statusCounts,
      missing_input_kpis: missingInputKpis,
      error_kpis: errorKpis,
      stale_kpis: staleKpis,
      unresolved_comments_count: unresolvedCommentsCount,
      total_kpis_in_scope: rows.length,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: rows.length > 0 ? 100 : 0,
      source: "review_kpi",
    }),
  };
};
