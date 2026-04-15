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
    requiresReportPeriod: true,
  },
  "review-bottlenecks": {
    key: "review-bottlenecks",
    label: "Review bottlenecks",
    requiresReportPeriod: false,
  },
  "stale-missing-kpi": {
    key: "stale-missing-kpi",
    label: "Stale / missing KPI",
    requiresReportPeriod: true,
  },
  "pending-queue": {
    key: "pending-queue",
    label: "Pending queue snapshot",
    requiresReportPeriod: true,
  },
};

export const validateQueryClassContext = (
  queryClass: QueryClass,
  filterContext?: QueryFilterContext,
): void => {
  if (
    queryClassMap[queryClass].requiresReportPeriod &&
    !filterContext?.reportPeriodId
  ) {
    throw new Error(
      "VALIDATION:reportPeriodId is required for this query class.",
    );
  }
};
