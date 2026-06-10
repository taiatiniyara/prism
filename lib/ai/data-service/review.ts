import { listReviewKpiRows } from "@/app/data-entry/review-kpi/service";
import { db } from "@/db/connection";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { eq, desc, and, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { hasGlobalUtilityAccess } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface ReviewQueueItem {
  kpi_name: string;
  status: string;
  last_updated: string | null;
  unresolved_comments: number;
}

export interface ReviewQueueData {
  items: ReviewQueueItem[];
  summary: {
    total: number;
    by_status: Record<string, number>;
  };
  report_period: string | null;
}

const resolvePeriod = async (
  user: CurrentUser,
  options: { report_period_id?: number | null; year?: number | null },
) => {
  if (options.report_period_id) return options.report_period_id;
  const predicates = [];
  if (!hasGlobalUtilityAccess(user) && user.org_id != null) {
    predicates.push(eq(reportPeriods.utility_id, user.org_id));
  }
  if (options.year) {
    predicates.push(sql`EXTRACT(YEAR FROM ${reportPeriods.report_date}) = ${options.year}`);
  }
  const [period] = await db
    .select({ id: reportPeriods.id })
    .from(reportPeriods)
    .where(predicates.length > 0 ? and(...predicates) : undefined)
    .orderBy(desc(reportPeriods.report_date))
    .limit(1);
  return period?.id ?? null;
};

export const getReviewQueue = async (
  user: CurrentUser,
  options: {
    report_period_id?: number | null;
    year?: number | null;
  } = {},
): Promise<AiToolResult<ReviewQueueData>> => {
  const periodId = await resolvePeriod(user, options);
  if (!periodId) {
    return {
      data: { items: [], summary: { total: 0, by_status: {} }, report_period: null },
      metadata: createToolMetadata({ source: "review_kpi" }),
      error: "No report period found",
    };
  }

  const rows = await listReviewKpiRows({
    reportTypeId: null,
    reportPeriodId: periodId,
    kpiCategoryId: null,
    kpiSubcategoryId: null,
    serviceAreaId: null,
  });

  const items: ReviewQueueItem[] = rows
    .filter((r) => r.result.status !== "calculated")
    .map((r) => ({
      kpi_name: r.kpiName,
      status: r.result.status,
      last_updated: r.inputs[0]?.updatedAt ?? null,
      unresolved_comments: r.inputs.reduce(
        (sum, input) => sum + input.comments.filter((c) => !c.resolved).length,
        0,
      ),
    }))
    .sort((a, b) => b.unresolved_comments - a.unresolved_comments);

  const byStatus: Record<string, number> = {};
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  }

  const [p] = await db
    .select({ display: reportPeriods.report_date })
    .from(reportPeriods)
    .where(eq(reportPeriods.id, periodId))
    .limit(1);

  return {
    data: {
      items: items.slice(0, 50),
      summary: { total: items.length, by_status: byStatus },
      report_period: p ? new Date(p.display).getFullYear().toString() : null,
    },
    metadata: createToolMetadata({ freshness: new Date(), completeness_pct: 100, source: "review_kpi" }),
  };
};

export interface InputStatusItem {
  input_name: string;
  service_area_id: number | null;
  current_value: string | null;
}

export interface InputStatusData {
  kpi_name: string;
  formula: string | null;
  inputs: InputStatusItem[];
  missing_inputs: string[];
}

export const getInputStatus = async (
  user: CurrentUser,
  options: {
    kpi_name: string;
    report_period_id?: number | null;
    year?: number | null;
  } = { kpi_name: "" },
): Promise<AiToolResult<InputStatusData>> => {
  const periodId = await resolvePeriod(user, options);
  if (!periodId) {
    return {
      data: { kpi_name: options.kpi_name, formula: null, inputs: [], missing_inputs: [] },
      metadata: createToolMetadata({ source: "review_kpi" }),
      error: "No report period found",
    };
  }

  const rows = await listReviewKpiRows({
    reportTypeId: null,
    reportPeriodId: periodId,
    kpiCategoryId: null,
    kpiSubcategoryId: null,
    serviceAreaId: null,
  });

  const match = rows.find((r) =>
    r.kpiName.toLowerCase().includes(options.kpi_name.toLowerCase()),
  );

  if (!match) {
    return {
      data: { kpi_name: options.kpi_name, formula: null, inputs: [], missing_inputs: [] },
      metadata: createToolMetadata({ source: "review_kpi" }),
      error: `KPI "${options.kpi_name}" not found in review data`,
    };
  }

  const inputs: InputStatusItem[] = match.inputs.map((input) => ({
    input_name: input.inputName,
    service_area_id: match.serviceAreaId,
    current_value: input.value,
  }));

  const missingInputs = match.inputs
    .filter((input) => input.value == null || input.value.trim() === "")
    .map((input) => input.inputName);

  return {
    data: {
      kpi_name: match.kpiName,
      formula: match.formulaText ?? null,
      inputs,
      missing_inputs: missingInputs,
    },
    metadata: createToolMetadata({ freshness: new Date(), completeness_pct: 100, source: "review_kpi" }),
  };
};
