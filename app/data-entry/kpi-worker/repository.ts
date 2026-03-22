import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import { kpiCalculationAttempts } from "@/db/schema/kpi";

import type {
  KpiCalculationAttemptRecord,
  KpiCalculationFailureType,
  KpiCalculationStatus,
  KpiWorkerScope,
} from "./types";

interface CreateAttemptParams {
  triggerId: string;
  sourceDataEntryId: string;
  reportPeriodId: number;
  scope: KpiWorkerScope;
  formulaVersion?: string;
  kpiDefId?: number | null;
  maxRetries?: number;
}

const toAttemptRecord = (
  row: typeof kpiCalculationAttempts.$inferSelect,
): KpiCalculationAttemptRecord => ({
  id: row.id,
  kpiDefId: row.kpi_def_id ?? 0,
  reportPeriodId: row.report_period_id,
  status: row.status as KpiCalculationStatus,
  formulaVersion: row.formula_version,
  retryCount: row.retry_count,
  failureReason: row.failure_reason,
  failureType: row.failure_type as KpiCalculationFailureType | null,
  startedAt: row.started_at,
  completedAt: row.completed_at,
});

const setAttemptStatus = async (
  attemptId: string,
  status: KpiCalculationStatus,
  updates?: {
    failureReason?: string | null;
    failureType?: KpiCalculationFailureType | null;
    retryCount?: number;
    deferredFollowUp?: boolean;
    formulaVersion?: string;
    completedAt?: Date | null;
  },
): Promise<void> => {
  await db
    .update(kpiCalculationAttempts)
    .set({
      status,
      failure_reason: updates?.failureReason,
      failure_type: updates?.failureType,
      retry_count: updates?.retryCount,
      deferred_follow_up: updates?.deferredFollowUp,
      formula_version: updates?.formulaVersion,
      completed_at: updates?.completedAt,
      updated_at: new Date(),
    })
    .where(eq(kpiCalculationAttempts.id, attemptId));
};

export const createKpiCalculationAttempt = async (
  params: CreateAttemptParams,
): Promise<KpiCalculationAttemptRecord> => {
  const [created] = await db
    .insert(kpiCalculationAttempts)
    .values({
      trigger_id: params.triggerId,
      source_data_entry_id: params.sourceDataEntryId,
      report_period_id: params.reportPeriodId,
      kpi_def_id: params.kpiDefId ?? null,
      scope: params.scope,
      status: "pending",
      formula_version: params.formulaVersion ?? "unspecified",
      retry_count: 0,
      max_retries: params.maxRetries ?? 3,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning();

  return toAttemptRecord(created);
};

export const markAttemptProcessing = async (
  attemptId: string,
): Promise<void> => {
  await db
    .update(kpiCalculationAttempts)
    .set({
      status: "processing",
      started_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(kpiCalculationAttempts.id, attemptId));
};

export const markAttemptCompleted = async (
  attemptId: string,
): Promise<void> => {
  await setAttemptStatus(attemptId, "completed", {
    failureReason: null,
    failureType: null,
    completedAt: new Date(),
  });
};

export const markAttemptFailed = async (
  attemptId: string,
  failureType: KpiCalculationFailureType,
  failureReason: string,
): Promise<void> => {
  await setAttemptStatus(attemptId, "failed", {
    failureReason,
    failureType,
    completedAt: new Date(),
  });
};

export const markAttemptRetryPending = async (
  attemptId: string,
  retryCount: number,
  failureReason?: string,
): Promise<void> => {
  await setAttemptStatus(attemptId, "pending", {
    retryCount,
    failureReason: failureReason ?? null,
    failureType: "transient-infra",
    completedAt: null,
  });
};

export const markDeferredFollowUpForScope = async (
  reportPeriodId: number,
  scope: KpiWorkerScope,
): Promise<void> => {
  const scopeJson = JSON.stringify(scope);

  await db
    .update(kpiCalculationAttempts)
    .set({
      deferred_follow_up: true,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(kpiCalculationAttempts.report_period_id, reportPeriodId),
        sql`${kpiCalculationAttempts.scope}::text = ${scopeJson}`,
      ),
    );
};
