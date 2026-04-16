import type { AiUserRole } from "./types";

export type AllowedReadServiceKey =
  | "completeness-summary"
  | "review-bottlenecks"
  | "stale-missing-kpi"
  | "pending-queue"
  | "aggregated-run-summary"
  | "aggregated-run-details"
  | "aggregated-failure-analysis"
  | "renewable-generation-utility-year";

export interface AllowedReadServiceDefinition {
  key: AllowedReadServiceKey;
  description: string;
  allowedRoles: AiUserRole[];
  deterministic: true;
  readOnly: true;
}

export const allowedReadServices: Record<
  AllowedReadServiceKey,
  AllowedReadServiceDefinition
> = {
  "completeness-summary": {
    key: "completeness-summary",
    description: "Completeness summaries by period and optional service area.",
    allowedRoles: ["DEV", "BMO", "BLO", "CEO"],
    deterministic: true,
    readOnly: true,
  },
  "review-bottlenecks": {
    key: "review-bottlenecks",
    description: "Queue bottlenecks for KPI review workflows.",
    allowedRoles: ["DEV", "BMO", "BLO", "CEO"],
    deterministic: true,
    readOnly: true,
  },
  "stale-missing-kpi": {
    key: "stale-missing-kpi",
    description: "Stale and missing KPI review items.",
    allowedRoles: ["DEV", "BMO", "BLO", "CEO"],
    deterministic: true,
    readOnly: true,
  },
  "pending-queue": {
    key: "pending-queue",
    description: "Pending queue snapshots by report period.",
    allowedRoles: ["DEV", "BMO", "BLO", "CEO"],
    deterministic: true,
    readOnly: true,
  },
  "aggregated-run-summary": {
    key: "aggregated-run-summary",
    description: "Summary of aggregated worker runs for scoped context.",
    allowedRoles: ["DEV", "BMO", "BLO", "CEO"],
    deterministic: true,
    readOnly: true,
  },
  "aggregated-run-details": {
    key: "aggregated-run-details",
    description: "Detailed outcomes for a specific aggregated worker run.",
    allowedRoles: ["DEV", "BMO", "BLO", "CEO"],
    deterministic: true,
    readOnly: true,
  },
  "aggregated-failure-analysis": {
    key: "aggregated-failure-analysis",
    description: "Failure reason analysis for aggregated worker runs.",
    allowedRoles: ["DEV", "BMO", "BLO", "CEO"],
    deterministic: true,
    readOnly: true,
  },
  "renewable-generation-utility-year": {
    key: "renewable-generation-utility-year",
    description:
      "Renewable generation totals by utility and year from scoped PRISM data.",
    allowedRoles: ["DEV", "BMO", "BLO", "CEO"],
    deterministic: true,
    readOnly: true,
  },
};

export const getAllowedReadService = (key: AllowedReadServiceKey) => {
  return allowedReadServices[key];
};
