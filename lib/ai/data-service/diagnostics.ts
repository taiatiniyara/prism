import { listReviewKpiRows } from "@/app/data-entry/review-kpi/service";
import { db } from "@/db/connection";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { dataEntries } from "@/db/schema/dataEntry";
import { and, eq, inArray } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { createToolMetadata, resolvePeriodId } from "./common";
import type { AiToolResult } from "../types";

// Why a KPI has no computed value. NOT every "missing-input" is a data-entry
// gap: an input the utility has explicitly declared "not available"
// (no_data_reason set) is a legitimate response, not pending work. Splitting
// these keeps the AI's completeness reporting honest.
export type MissingInputReason =
  | "awaiting_input" // >=1 required input not entered yet — a real gap
  | "declared_unavailable" // all unmet inputs are declared not-available by the utility
  | "compute_pending"; // all inputs present, value just not (re)computed yet

export interface MissingInputBreakdown {
  awaiting_input: number;
  declared_unavailable: number;
  compute_pending: number;
}

export interface KpiDiagnostic {
  name: string;
  status: string;
  has_unresolved_comments: boolean;
  reason?: MissingInputReason;
}

export interface KpiDiagnosticsData {
  status_counts: Record<string, number>;
  missing_input_kpis: KpiDiagnostic[];
  missing_input_breakdown: MissingInputBreakdown;
  error_kpis: KpiDiagnostic[];
  stale_kpis: KpiDiagnostic[];
  unresolved_comments_count: number;
  total_kpis_in_scope: number;
}

export const getKpiDiagnostics = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
  } = {},
): Promise<AiToolResult<KpiDiagnosticsData | null>> => {
  const resolvedPeriodId = await resolvePeriodId(user, options);

  // On any failure return data: null (never a zeroed KpiDiagnosticsData) — a
  // populated-but-empty object reads to the model as a clean 0/0/0 scorecard
  // however the error is worded (c029). Null + error is unmistakable.
  if (!resolvedPeriodId) {
    return {
      data: null,
      metadata: createToolMetadata({ completeness_pct: 0, source: "review_kpi" }),
      error: options.year
        ? `No report period found for year ${options.year} — no diagnostics were computed.`
        : "No report period found — no diagnostics were computed.",
    };
  }

  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    const [period] = await db
      .select({ utility_id: reportPeriods.utility_id })
      .from(reportPeriods)
      .where(eq(reportPeriods.id, resolvedPeriodId))
      .limit(1);

    if (!period || period.utility_id !== user.org_id) {
      return {
        data: null,
        metadata: createToolMetadata({ completeness_pct: 0, source: "review_kpi" }),
        error: "Report period not found — it isn't available to your utility, so no diagnostics were computed.",
      };
    }
  }

  const rows = await listReviewKpiRows({
    reportTypeId: null,
    reportPeriodId: resolvedPeriodId,
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

  const missingRows = rows.filter(
    (row) => row.result.status === "missing-input",
  );

  // Determine, per required input of the missing KPIs, whether it actually has
  // a value (in ANY value column — the medallion migration types values into
  // value_numeric/boolean/option, leaving the legacy `value` text column null)
  // or has been declared not-available (no_data_reason). The review rows don't
  // carry this, so read data_entries directly for the period.
  const missingInputDefIds = [
    ...new Set(missingRows.flatMap((row) => row.inputs.map((i) => i.inputDefId))),
  ];
  const availabilityByInput = new Map<
    number,
    { hasValue: boolean; declaredUnavailable: boolean }
  >();
  if (missingInputDefIds.length > 0) {
    const entryRows = await db
      .select({
        measureDefId: dataEntries.measure_def_id,
        value: dataEntries.value,
        valueNumeric: dataEntries.value_numeric,
        valueBoolean: dataEntries.value_boolean,
        valueOptionId: dataEntries.value_option_id,
        noDataReason: dataEntries.no_data_reason,
      })
      .from(dataEntries)
      .where(
        and(
          eq(dataEntries.report_period_id, resolvedPeriodId),
          eq(dataEntries.is_deleted, false),
          eq(dataEntries.is_relevant, true),
          inArray(dataEntries.measure_def_id, missingInputDefIds),
        ),
      );
    for (const e of entryRows) {
      const hasValue =
        e.valueNumeric != null ||
        e.valueBoolean != null ||
        e.valueOptionId != null ||
        (e.value != null && e.value.trim() !== "");
      const prev = availabilityByInput.get(e.measureDefId);
      // With multiple entries per input (e.g. per service area), the input is
      // satisfied if ANY entry has a value; declared-unavailable only counts
      // for entries that have no value but carry a no_data_reason.
      availabilityByInput.set(e.measureDefId, {
        hasValue: hasValue || (prev?.hasValue ?? false),
        declaredUnavailable:
          (!hasValue && e.noDataReason != null) ||
          (prev?.declaredUnavailable ?? false),
      });
    }
  }

  const classifyMissing = (
    row: (typeof rows)[number],
  ): MissingInputReason => {
    const unmet = row.inputs.filter(
      (i) => !(availabilityByInput.get(i.inputDefId)?.hasValue ?? false),
    );
    if (unmet.length === 0) return "compute_pending";
    // "awaiting" if any unmet input is genuinely absent (not a declared N/A);
    // "declared_unavailable" only when every unmet input was declared N/A.
    const anyGenuinelyAbsent = unmet.some(
      (i) => !(availabilityByInput.get(i.inputDefId)?.declaredUnavailable ?? false),
    );
    return anyGenuinelyAbsent ? "awaiting_input" : "declared_unavailable";
  };

  const missing_input_breakdown: MissingInputBreakdown = {
    awaiting_input: 0,
    declared_unavailable: 0,
    compute_pending: 0,
  };
  const missingWithReason = missingRows.map((row) => {
    const reason = classifyMissing(row);
    missing_input_breakdown[reason]++;
    return { row, reason };
  });

  const missingInputKpis: KpiDiagnostic[] = missingWithReason
    .slice(0, 10)
    .map(({ row, reason }) => ({
      name: row.kpiName,
      status: row.result.status,
      reason,
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
      missing_input_breakdown,
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
