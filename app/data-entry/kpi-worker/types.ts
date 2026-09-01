export type KpiCalculationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type KpiCalculationFailureType =
  | "missing-input"
  | "formula-invalid"
  | "evaluation-error"
  | "transient-infra"
  | "unexpected";

export interface KpiWorkerScope {
  reportPeriodId: number;
  organizationId?: number | null;
  serviceAreaId?: number | null;
  unitId?: number | null;
  energyProviderId?: number | null;
  energyTypeId?: number | null;
  energySourceId?: number | null;
  customerTypeId?: number | null;
  paymentModeId?: number | null;
}

export interface KpiWorkerTrigger {
  triggerId?: string;
  triggeredAt?: string;
  sourceDataEntryId: string;
  inputDefId: number;
  scope: KpiWorkerScope;
  triggeredByUserId?: string;
}

export interface KpiWorkerRunResult {
  runId: string;
  status: KpiCalculationStatus;
  processedKpiCount: number;
  failedKpiCount: number;
}

export interface KpiCalculationAttemptRecord {
  id: string;
  kpiDefId: number;
  reportPeriodId: number;
  status: KpiCalculationStatus;
  formulaVersion: string;
  retryCount: number;
  failureReason?: string | null;
  failureType?: KpiCalculationFailureType | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}
