export type AiUserRole = "DEV" | "BMO" | "BLO" | "CEO";

export type QueryClass =
  | "completeness"
  | "review-bottlenecks"
  | "stale-missing-kpi"
  | "pending-queue";

export interface QueryFilterContext {
  reportPeriodId?: number;
  serviceAreaId?: number;
}

export interface AiQueryInput {
  prompt: string;
  queryClass: QueryClass;
  filterContext?: QueryFilterContext;
  sessionContextId?: string | null;
}

export type AiTraceStatus =
  | "SUCCESS"
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "TIMEOUT"
  | "PARTIAL_FAILURE"
  | "NO_DATA"
  | "POLICY_BYPASS";

export interface AttributionItem {
  sourceName: string;
  sourceType: "SERVICE_FUNCTION" | "DATASET";
  sourceRef: string;
}

export interface MetricItem {
  label: string;
  value: string | number;
  unit?: string | null;
}

export type RowItem = Record<string, unknown>;

export interface ExportDescriptor {
  pdfAvailable: boolean;
  csvAvailable: boolean;
  reportId?: string | null;
}

export interface AiQueryResponse {
  traceId: string;
  summary: string;
  metrics: MetricItem[];
  rows: RowItem[];
  attribution: AttributionItem[];
  export: ExportDescriptor;
  warnings?: string[];
}

export interface AiTraceRecord {
  traceId: string;
  requestId: string;
  selectedTools: string[];
  latencyMs: number;
  status: AiTraceStatus;
  failureType?: string | null;
  rowCountReturned: number;
  retainedUntil: string;
  createdAt: string;
}
