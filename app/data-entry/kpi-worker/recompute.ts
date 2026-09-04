import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/connection";
import { kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";
import { benchmarkingParticipantCondition } from "@/lib/benchmarking/participation";

import { computeKpiTarget } from "./compute-kpi-target";
import { resolveKpiTargetsByIds } from "./resolveTargets";
import type { KpiWorkerScope } from "./types";

export interface RecomputeKpiNowArgs {
  kpiDefIds?: number[];
  all?: boolean;
  reportPeriodIds?: number[];
}

export interface RecomputeKpiNowResult {
  processed: number;
  failed: number;
  byPeriod: Array<{
    reportPeriodId: number;
    kpiDefId: number;
    status: string;
    value?: string;
    reason?: string;
  }>;
}

/**
 * Manual "Compute now" recompute path. Reruns the shared `computeKpiTarget`
 * pipeline for a chosen set of KPIs across a chosen set of report periods,
 * without the data-entry trigger. Runs sequentially (single-user manual
 * action) and isolates each (target × period) so one failure does not abort
 * the batch. Uses the SAME per-target compute step as the triggered worker —
 * including the additive-formula zero-fill — so a KPI can never compute to a
 * number on save and `missing-input` here (or vice versa).
 *
 * Not shared with the worker: attempt-row tracking and the scope lock. Those
 * are the worker's concern; a manual batch recompute is a single-user action.
 */
export async function recomputeKpiNow(
  args: RecomputeKpiNowArgs,
): Promise<RecomputeKpiNowResult> {
  // 1. Determine the KPI definition ids to recompute.
  let kpiDefIds: number[];
  if (args.all) {
    const activeDefs = await db
      .select({
        id: kpiDefinitions.id,
        formula: kpiDefinitions.formula,
        formula_inputs: kpiDefinitions.formula_inputs,
      })
      .from(kpiDefinitions)
      .where(eq(kpiDefinitions.is_active, true));

    kpiDefIds = activeDefs
      .filter(
        (def) =>
          Boolean(def.formula?.trim()) &&
          Array.isArray(def.formula_inputs) &&
          def.formula_inputs.length > 0,
      )
      .map((def) => def.id);
  } else {
    kpiDefIds = args.kpiDefIds ?? [];
  }

  const result: RecomputeKpiNowResult = {
    processed: 0,
    failed: 0,
    byPeriod: [],
  };

  if (kpiDefIds.length === 0) {
    return result;
  }

  // 2. Determine the report periods to recompute against.
  // Only periods OPTED INTO benchmarking are recomputed — the canonical
  // predicate (organisations.is_utility = true AND report_periods.bm_opted_in =
  // true) via the ONE shared helper `benchmarkingParticipantCondition()`, so
  // this worker, the calculator's period enumeration, and any future gate stay
  // in lockstep. A non-opted-in period is never benchmarked, so computing — and
  // surfacing a failed row for — it is noise; those periods are skipped.
  // NOTE: no `periodAccessPredicate` is applied here — this internal function
  // has no CurrentUser to scope by, so it selects all opted-in periods (or the
  // explicit ids given, still gated on participation). Callers that need
  // per-user access control must pre-filter the `reportPeriodIds` they pass in.
  const periodQuery = db
    .select({
      id: reportPeriods.id,
      utilityId: reportPeriods.utility_id,
      reportDate: reportPeriods.report_date,
    })
    .from(reportPeriods)
    .innerJoin(
      organisations,
      eq(organisations.id, reportPeriods.utility_id),
    );

  const participates = benchmarkingParticipantCondition();

  const periods =
    args.reportPeriodIds && args.reportPeriodIds.length > 0
      ? await periodQuery.where(
          and(inArray(reportPeriods.id, args.reportPeriodIds), participates),
        )
      : await periodQuery.where(participates);

  // 4. Resolve targets once per distinct context (utility + year + month) to
  // avoid re-querying kpi_definitions for every period that shares a context.
  const targetCache = new Map<
    string,
    Awaited<ReturnType<typeof resolveKpiTargetsByIds>>
  >();

  for (const period of periods) {
    // 3. Derive the resolution context from report_date (mirror resolveTargets.ts).
    const reportDate = period.reportDate ?? new Date();
    const ctx = {
      utilityId: period.utilityId,
      year: reportDate.getFullYear(),
      month: reportDate.getMonth() + 1,
    };

    const cacheKey = `${ctx.utilityId}-${ctx.year}-${ctx.month}`;
    let targets = targetCache.get(cacheKey);
    if (!targets) {
      targets = await resolveKpiTargetsByIds(kpiDefIds, ctx);
      targetCache.set(cacheKey, targets);
    }

    // For each (target × period): the shared compute step, wrapped in
    // try/catch so a single failure doesn't abort the batch.
    for (const target of targets) {
      const scope: KpiWorkerScope = {
        reportPeriodId: period.id,
        organizationId: period.utilityId,
        serviceAreaId: null,
        unitId: null,
        customerTypeId: null,
        paymentModeId: null,
      };

      try {
        const outcome = await computeKpiTarget({ target, scope });
        if (outcome.status === "ok") {
          result.processed += 1;
          result.byPeriod.push({
            reportPeriodId: period.id,
            kpiDefId: target.kpiDefId,
            status: "ok",
            value: outcome.value,
          });
        } else {
          result.failed += 1;
          result.byPeriod.push({
            reportPeriodId: period.id,
            kpiDefId: target.kpiDefId,
            status: "failed",
            reason: outcome.reason,
          });
        }
      } catch (error) {
        result.failed += 1;
        result.byPeriod.push({
          reportPeriodId: period.id,
          kpiDefId: target.kpiDefId,
          status: "failed",
          reason: String(error),
        });
      }
    }
  }

  return result;
}
