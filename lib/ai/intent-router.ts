import type { QueryClass } from "./types";
import type { AllowedReadServiceKey } from "./allowed-read-services";

export interface IntentRouteResult {
  queryClass: QueryClass;
  serviceKey: AllowedReadServiceKey;
  requiresReportPeriod: boolean;
}

const QUERY_CLASS_TO_SERVICE: Record<QueryClass, AllowedReadServiceKey> = {
  completeness: "completeness-summary",
  "review-bottlenecks": "review-bottlenecks",
  "stale-missing-kpi": "stale-missing-kpi",
  "pending-queue": "pending-queue",
};

export const requiresReportPeriod = (queryClass: QueryClass): boolean => {
  return queryClass !== "review-bottlenecks";
};

export const routeIntent = (queryClass: QueryClass): IntentRouteResult => {
  return {
    queryClass,
    serviceKey: QUERY_CLASS_TO_SERVICE[queryClass],
    requiresReportPeriod: requiresReportPeriod(queryClass),
  };
};

export const inferQueryClassFromPrompt = (
  prompt: string,
): QueryClass | "AMBIGUOUS" => {
  const normalized = prompt.toLowerCase();

  const matches: QueryClass[] = [];

  if (/(complet(e|ion)|coverage)/.test(normalized)) {
    matches.push("completeness");
  }
  if (/(bottleneck|blocked|delay)/.test(normalized)) {
    matches.push("review-bottlenecks");
  }
  if (/(stale|missing\s+kpi|overdue)/.test(normalized)) {
    matches.push("stale-missing-kpi");
  }
  if (/(pending|queue|awaiting)/.test(normalized)) {
    matches.push("pending-queue");
  }

  if (matches.length !== 1) {
    return "AMBIGUOUS";
  }

  return matches[0];
};
