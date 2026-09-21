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

/** Workflow status of a single input's underlying data_entries row (Pending/Entered/Reviewed/Approved). */
export interface ReviewKpiInputStatus {
  id: number;
  code: string;
  label: string;
  color: string;
  /** True once this input is CEO Approved — the terminal, published state. */
  publishable: boolean;
}

/** Safety-net flag: the input's value falls outside its configured valid range/polarity. */
export interface ReviewKpiInputFlag {
  message: string;
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
  status: ReviewKpiInputStatus;
  flag: ReviewKpiInputFlag | null;
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

/** What the viewing user is allowed to do on this page — computed server-side from their role. */
export interface ReviewKpiPermissions {
  /** Can advance Entered -> Reviewed, and send back Reviewed -> Entered (the BLO check). */
  canReview: boolean;
  /** Can advance Reviewed -> Approved, and send back Approved -> Reviewed (the CEO sign-off). */
  canApprove: boolean;
}

export interface ReviewKpiPageViewModel {
  context: ReviewKpiFilterContext;
  options: ReviewKpiFilterOptions;
  rows: ReviewKpiRow[];
  permissions: ReviewKpiPermissions;
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
  /** Set true to proceed after a CONFIRM_REQUIRED response for an already-Approved input. */
  confirmed?: boolean;
}

export interface AddReviewKpiCommentPayload {
  comment: string;
}

export interface UpdateReviewKpiInputStatusPayload {
  statusId: number;
  updatedAt: string;
  kpiDefId: number;
}

export interface ReviewKpiBulkAdvanceResult {
  advanced: number;
  held: number;
}
