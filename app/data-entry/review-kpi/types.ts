import { DataEntryControlType } from "@/app/data-entry/types";

export interface ReviewKpiFilterContext {
  reportTypeId: number | null;
  reportPeriodId: number | null;
  kpiCategoryId: number | null;
  kpiSubcategoryId: number | null;
  serviceAreaId: number | null;
}

export interface InputComment {
  comment: string;
  commenterId: string;
  commenterName?: string | null;
  commenterRole: string;
  date: string;
  resolved?: boolean;
  replies?: InputComment[];
}

export interface ReviewKpiInputValue {
  dataEntryId: string;
  inputDefId: number;
  inputName: string;
  unitName: string | null;
  value: string | null;
  controlType: DataEntryControlType;
  comments: InputComment[];
  updatedAt: string;
  updatedById: string | null;
  /**
   * The KPI formula's `formula_inputs[].variable_name` this row was matched
   * against, when known. A KPI's formula can (correctly, or by a data
   * authoring mistake — see kpi_def_id 62/63/80) pin two distinct variables
   * to the exact same dimension slice, so the same `dataEntryId` can appear
   * more than once in one row's `inputs`. `dataEntryId` alone is therefore
   * NOT safe as a React list key for this array — `variableName` is,
   * because a formula can never reference two bindings with the same name.
   * Omitted (not just `dataEntryId`-derived) on responses that aren't
   * resolved against a specific binding, e.g. the single-input PATCH result.
   */
  variableName?: string;
}

export type ReviewKpiResultStatus =
  | "calculated"
  | "missing-input"
  | "stale"
  | "error";

export interface ReviewKpiResult {
  kpiId: string | null;
  value: string | null;
  status: ReviewKpiResultStatus;
  calculatedAt: string | null;
  formulaVersion: string | null;
}

export interface ReviewKpiRow {
  kpiDefId: number;
  kpiName: string;
  unitName: string | null;
  formulaText: string | null;
  categoryId: number | null;
  subcategoryId: number | null;
  reportPeriodId: number;
  serviceAreaId: number | null;
  inputs: ReviewKpiInputValue[];
  result: ReviewKpiResult;
}

export interface ReviewKpiFilterOption {
  id: number;
  name: string;
  parent_id?: number | null;
}

export interface ReviewKpiFilterOptions {
  reportTypes: ReviewKpiFilterOption[];
  reportPeriods: ReviewKpiFilterOption[];
  kpiCategories: ReviewKpiFilterOption[];
  kpiSubcategories: ReviewKpiFilterOption[];
  serviceAreas: ReviewKpiFilterOption[];
}

export interface ReviewKpiPageViewModel {
  context: ReviewKpiFilterContext;
  options: ReviewKpiFilterOptions;
  rows: ReviewKpiRow[];
}

export type SyncEventType =
  | "input-updated"
  | "comment-added"
  | "kpi-recalculated"
  | "sync-recovered";

export interface SyncEventEnvelope {
  eventId: string;
  eventType: SyncEventType;
  occurredAt: string;
  reportPeriodId: number;
  serviceAreaId: number | null;
  kpiDefId: number;
  inputDefId: number | null;
  dataEntryId: string | null;
  payload: Record<string, unknown>;
}

export interface ReviewKpiConflictResponse {
  message: string;
  latest: ReviewKpiInputValue;
}

export interface UpdateReviewKpiInputPayload {
  value: string | null;
  updatedAt: string;
  kpiDefId: number;
}

export interface AddReviewKpiCommentPayload {
  comment: string;
}
