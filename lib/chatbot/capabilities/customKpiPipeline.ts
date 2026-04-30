import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import { user as userTable } from "@/db/schema/auth-schema";
import {
  customKpiDecisions,
  customKpiLifecycleEvents,
  customKpiRequests,
} from "@/db/schema/custom-kpi-requests";

import { type CapabilityContext, type CapabilityResolution } from "./common";

const isUtilityScopedRole = (role: string): boolean =>
  role !== "DEV" && role !== "BMO";

const STATUS_ORDER: ReadonlyArray<
  "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "REPLACED"
> = ["PENDING_REVIEW", "APPROVED", "REJECTED", "REPLACED"];

const daysBetween = (from: Date, to: Date): number =>
  Math.max(
    0,
    Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)),
  );

export const buildCustomKpiPipelineContext = async (
  ctx: CapabilityContext,
): Promise<CapabilityResolution> => {
  const utilityScoped =
    isUtilityScopedRole(ctx.user.role) &&
    ctx.user.org_id != null &&
    !ctx.allUtilitiesRequested;

  const baseRequest = db
    .select({
      id: customKpiRequests.id,
      status: customKpiRequests.status,
      visibility_scope: customKpiRequests.visibility_scope,
      created_at: customKpiRequests.created_at,
      updated_at: customKpiRequests.updated_at,
      submitter_org_id: userTable.organisation_id,
    })
    .from(customKpiRequests)
    .innerJoin(
      userTable,
      eq(customKpiRequests.submitter_user_id, userTable.id),
    );

  const requestRows = utilityScoped
    ? await baseRequest.where(eq(userTable.organisation_id, ctx.user.org_id!))
    : await baseRequest;

  if (requestRows.length === 0) {
    return {
      capability: "custom-kpi-pipeline-snapshot",
      contextBlock: [
        "PRISM data grounding: custom KPI pipeline snapshot.",
        "Available dimensions: custom-kpi-request status, age in days, visibility scope, lifecycle event type.",
        "Unavailable dimensions in this grounding: KPI calculated values, formula validation outcome, reviewer identity (only counts).",
        `Scope: ${utilityScoped ? `default utility (org ${ctx.user.org_id})` : "all-utilities (or platform-wide)"}.`,
        "No custom KPI requests in scope. Submitters can create one from /settings/kpi (Request Custom KPI).",
      ].join("\n"),
    };
  }

  const now = new Date();
  const countsByStatus: Record<string, number> = {};
  let pendingAgeSum = 0;
  let pendingAgeCount = 0;
  let oldestPendingDays = 0;
  let promotedCount = 0;
  let lastSevenDaysSubmitted = 0;
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  for (const row of requestRows) {
    countsByStatus[row.status] = (countsByStatus[row.status] ?? 0) + 1;
    if (row.status === "PENDING_REVIEW") {
      const age = daysBetween(row.created_at, now);
      pendingAgeSum += age;
      pendingAgeCount += 1;
      if (age > oldestPendingDays) {
        oldestPendingDays = age;
      }
    }
    if (row.visibility_scope === "GLOBAL") {
      promotedCount += 1;
    }
    if (row.created_at.getTime() >= sevenDaysAgo) {
      lastSevenDaysSubmitted += 1;
    }
  }

  const requestIds = requestRows.map((row) => row.id);

  const decisionRows = requestIds.length
    ? await db
        .select({
          decision_type: customKpiDecisions.decision_type,
          count: sql<number>`count(*)::int`,
        })
        .from(customKpiDecisions)
        .where(
          sql`${customKpiDecisions.request_id} = any(${requestIds}::uuid[])`,
        )
        .groupBy(customKpiDecisions.decision_type)
    : [];

  const eventRows = requestIds.length
    ? await db
        .select({
          event_type: customKpiLifecycleEvents.event_type,
          count: sql<number>`count(*)::int`,
        })
        .from(customKpiLifecycleEvents)
        .where(
          sql`${customKpiLifecycleEvents.request_id} = any(${requestIds}::uuid[])`,
        )
        .groupBy(customKpiLifecycleEvents.event_type)
    : [];

  const recentlyDecided = requestIds.length
    ? await db
        .select({
          decision_type: customKpiDecisions.decision_type,
          created_at: customKpiDecisions.created_at,
        })
        .from(customKpiDecisions)
        .where(
          sql`${customKpiDecisions.request_id} = any(${requestIds}::uuid[])`,
        )
        .orderBy(desc(customKpiDecisions.created_at))
        .limit(5)
    : [];

  const sankeyHints: string[] = [];
  const submittedTotal = requestRows.length;
  for (const status of STATUS_ORDER) {
    const count = countsByStatus[status] ?? 0;
    if (count > 0) {
      sankeyHints.push(`SUBMITTED -> ${status}: ${count}`);
    }
  }
  if (promotedCount > 0) {
    sankeyHints.push(`APPROVED -> PROMOTED_TO_LIBRARY: ${promotedCount}`);
  }

  const avgPendingAge =
    pendingAgeCount > 0 ? Math.round(pendingAgeSum / pendingAgeCount) : 0;

  return {
    capability: "custom-kpi-pipeline-snapshot",
    contextBlock: [
      "PRISM data grounding: custom KPI pipeline snapshot.",
      "Available dimensions: custom-kpi-request status, age in days, visibility scope, decision type, lifecycle event type.",
      "Unavailable dimensions in this grounding: KPI calculated values, formula validation outcome, reviewer identity (only counts), submitter identity (only utility scope).",
      `Scope: ${utilityScoped ? `default utility (org ${ctx.user.org_id})` : "all-utilities (platform-wide)"}.`,
      `Total requests in scope: ${submittedTotal}`,
      `Submitted in the last 7 days: ${lastSevenDaysSubmitted}`,
      `Promoted to global library: ${promotedCount}`,
      `Average pending age (days): ${avgPendingAge}`,
      `Oldest pending request (days): ${oldestPendingDays}`,
      "Counts by status:",
      ...STATUS_ORDER.map(
        (status) => `- ${status}: ${countsByStatus[status] ?? 0}`,
      ),
      "Decision counts:",
      ...(decisionRows.length
        ? decisionRows.map(
            (row) => `- ${row.decision_type}: ${Number(row.count)}`,
          )
        : ["- No decisions logged yet."]),
      "Lifecycle event counts:",
      ...(eventRows.length
        ? eventRows.map((row) => `- ${row.event_type}: ${Number(row.count)}`)
        : ["- No lifecycle events logged yet."]),
      "Recent decisions (latest 5):",
      ...(recentlyDecided.length
        ? recentlyDecided.map(
            (row) =>
              `- ${row.decision_type} on ${row.created_at.toISOString().split("T")[0]}`,
          )
        : ["- No recent decisions."]),
      "Sankey lineage hints (use for sankey visual when asked):",
      ...(sankeyHints.length
        ? sankeyHints.map((line) => `- ${line}`)
        : ["- No flows to render yet."]),
    ].join("\n"),
  };
};
