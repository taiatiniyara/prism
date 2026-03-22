import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/connection";
import { kpiCalculationAttempts } from "@/db/schema/kpi";

import type { KpiWorkerStatusSummary } from "@/app/data-entry/types";

export interface KpiStatusFilter {
  reportPeriodId: number;
  serviceAreaId?: number | null;
  energyResourceId?: number | null;
}

interface AttemptTransitionInput {
  currentStatus: KpiWorkerStatusSummary["status"];
  hasFailure: boolean;
  retryCount: number;
  maxRetries: number;
  transientFailure: boolean;
}

export const getNextAttemptStatus = (
  input: AttemptTransitionInput,
): KpiWorkerStatusSummary["status"] => {
  if (!input.hasFailure) {
    return "completed";
  }

  if (input.transientFailure && input.retryCount < input.maxRetries) {
    return "pending";
  }

  return "failed";
};

export const mapFailureMessage = (
  status: KpiWorkerStatusSummary["status"],
  failureReason?: string | null,
): string | null => {
  if (status !== "failed") {
    return null;
  }

  if (failureReason && failureReason.trim().length > 0) {
    return failureReason;
  }

  return "Calculation failed. Please review source inputs and formula metadata.";
};

export const listKpiWorkerStatuses = async (
  filter: KpiStatusFilter,
): Promise<KpiWorkerStatusSummary[]> => {
  const whereConditions = [
    eq(kpiCalculationAttempts.report_period_id, filter.reportPeriodId),
  ];

  const rows = await db
    .select({
      id: kpiCalculationAttempts.id,
      triggerId: kpiCalculationAttempts.trigger_id,
      kpiDefId: kpiCalculationAttempts.kpi_def_id,
      status: kpiCalculationAttempts.status,
      retryCount: kpiCalculationAttempts.retry_count,
      formulaVersion: kpiCalculationAttempts.formula_version,
      failureReason: kpiCalculationAttempts.failure_reason,
      failureType: kpiCalculationAttempts.failure_type,
      startedAt: kpiCalculationAttempts.started_at,
      completedAt: kpiCalculationAttempts.completed_at,
      updatedAt: kpiCalculationAttempts.updated_at,
      scope: kpiCalculationAttempts.scope,
    })
    .from(kpiCalculationAttempts)
    .where(and(...whereConditions))
    .orderBy(desc(kpiCalculationAttempts.updated_at))
    .limit(20);

  return rows
    .filter((row) => {
      if (
        filter.serviceAreaId != null &&
        row.scope?.serviceAreaId !== filter.serviceAreaId
      ) {
        return false;
      }

      if (
        filter.energyResourceId != null &&
        row.scope?.energyResourceId !== filter.energyResourceId
      ) {
        return false;
      }

      return true;
    })
    .map((row) => ({
      id: row.id,
      triggerId: row.triggerId,
      kpiDefId: row.kpiDefId,
      status: row.status as KpiWorkerStatusSummary["status"],
      retryCount: row.retryCount,
      formulaVersion: row.formulaVersion,
      failureReason: mapFailureMessage(
        row.status as KpiWorkerStatusSummary["status"],
        row.failureReason,
      ),
      failureType: row.failureType as KpiWorkerStatusSummary["failureType"],
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    }));
};
