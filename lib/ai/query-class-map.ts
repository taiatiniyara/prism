import type { QueryClass, QueryFilterContext } from "./types";

export interface QueryClassDefinition {
  key: QueryClass;
  label: string;
  requiresReportPeriod: boolean;
}

export const queryClassMap: Record<QueryClass, QueryClassDefinition> = {
  completeness: {
    key: "completeness",
    label: "Completeness summary",
    requiresReportPeriod: false,
  },
  "review-bottlenecks": {
    key: "review-bottlenecks",
    label: "Review bottlenecks",
    requiresReportPeriod: false,
  },
  "stale-missing-kpi": {
    key: "stale-missing-kpi",
    label: "Stale / missing KPI",
    requiresReportPeriod: false,
  },
  "pending-queue": {
    key: "pending-queue",
    label: "Pending queue snapshot",
    requiresReportPeriod: false,
  },
  "aggregation-run-summary": {
    key: "aggregation-run-summary",
    label: "Aggregation run summary",
    requiresReportPeriod: false,
  },
  "aggregation-run-details": {
    key: "aggregation-run-details",
    label: "Aggregation run details",
    requiresReportPeriod: false,
  },
  "aggregation-failure-analysis": {
    key: "aggregation-failure-analysis",
    label: "Aggregation failure analysis",
    requiresReportPeriod: false,
  },
  "generation-renewable-by-utility-year": {
    key: "generation-renewable-by-utility-year",
    label: "Renewable generation by utility and year",
    requiresReportPeriod: false,
  },
};

export const validateQueryClassContext = (
  _queryClass: QueryClass,
  _filterContext?: QueryFilterContext,
): void => {
  // Prompt-first execution: allow all query classes to run without explicit
  // client-supplied context and let service-specific logic infer defaults.
};
