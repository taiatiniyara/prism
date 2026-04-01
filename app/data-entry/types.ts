import { DataEntryFilterContext } from "@/app/data-entry/constants";

export interface DataEntryFilterOption {
  id: number;
  name: string;
}

export interface DataEntryFilterOptions {
  reportTypes: DataEntryFilterOption[];
  reportPeriods: DataEntryFilterOption[];
  inputCategories: DataEntryFilterOption[];
  inputSubcategories: DataEntryFilterOption[];
  serviceAreas: DataEntryFilterOption[];
}

export type DataEntryControlType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "date"
  | "managedLists"
  | "fallback";

export interface DataEntryInputRowView {
  dataEntryId?: string;
  inputDefId: number;
  energyResourceId?: number | null;
  inputName: string;
  unitName: string | null;
  dataTypeId: number;
  controlType: DataEntryControlType;
  isDataNotAvailable?: boolean;
  updatedByName?: string | null;
  updatedByRole?: string | null;
  updatedAt?: string | null;
  value: string | null;
  comments: string | null;
}

export interface DataEntryGeneratorGroupView {
  generatorId: number;
  generatorName: string;
  serviceAreaId: number;
  rows: DataEntryInputRowView[];
}

export interface DataEntryProgressSummary {
  completedInputs: number;
  totalInputs: number;
}

export interface DataEntryKpiWorkerSnapshot {
  latestFailureReason: string | null;
  latestFailureUpdatedAt: string | null;
}

export interface DataEntryPageViewModel {
  context: DataEntryFilterContext;
  options: DataEntryFilterOptions;
  progress: DataEntryProgressSummary;
  kpiWorker: DataEntryKpiWorkerSnapshot;
  ui: {
    showServiceAreaSelector: boolean;
    generationMode: boolean;
  };
  inputs:
    | {
        mode: "flat";
        rows: DataEntryInputRowView[];
      }
    | {
        mode: "grouped-by-generator";
        groups: DataEntryGeneratorGroupView[];
      };
}

export interface AggregatedWorkerScope {
  reportPeriodId: number;
  serviceAreaId?: number | null;
  energyResourceId?: number | null;
}

export type AggregatedWorkerOutcomeReason =
  | "missing-value"
  | "unknown-variable"
  | "evaluation-error";

export interface AggregatedWorkerTargetOutcome {
  runId: string;
  inputDefId: number;
  status: "calculated" | "skipped";
  reason?: AggregatedWorkerOutcomeReason;
  calculatedValue?: string;
}

export interface AggregatedWorkerRunSummary {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed";
  calculated: number;
  skipped: number;
  scope: AggregatedWorkerScope;
}

export interface KpiWorkerStatusSummary {
  id: string;
  triggerId: string;
  kpiDefId: number | null;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  formulaVersion: string;
  failureReason: string | null;
  failureType:
    | "missing-input"
    | "formula-invalid"
    | "evaluation-error"
    | "transient-infra"
    | "unexpected"
    | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}
