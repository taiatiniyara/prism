import type { AiUserRole } from "./types";

export type AllowedReadServiceKey =
  | "completeness-summary"
  | "review-bottlenecks"
  | "stale-missing-kpi"
  | "pending-queue";

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
};

export const getAllowedReadService = (key: AllowedReadServiceKey) => {
  return allowedReadServices[key];
};
