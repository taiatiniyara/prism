import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/connection";
import { kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";
import { organisations } from "@/db/schema/utility";

import { evaluateKpiFormula } from "./evaluator";
import { upsertCalculatedKpiValue } from "./persistKpi";
import { resolveFormulaInputValues } from "./resolveInputs";
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
 * Manual "Compute now" recompute path. Reruns the existing resolve → evaluate →
 * persist pipeline for a chosen set of KPIs across a chosen set of report
 * periods, without the data-entry trigger. Runs sequentially (single-user
 * manual action) and isolates each (target × period) so one failure does not
 * abort the batch. Reuses the worker internals verbatim — no resolution or
 * evaluation logic is reimplemented here.
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
  // Only periods for utilities that PARTICIPATE in benchmarking
  // (organisations.bm_participates = true) are recomputed. A non-participating
  // utility's KPIs are never benchmarked, so computing — and surfacing a failed
  // row for — its periods is noise; those periods are skipped entirely.
  // NOTE: no `periodAccessPredicate` is applied here — this internal function
  // has no CurrentUser to scope by, so it selects all participating periods (or
  // the explicit ids given, still gated on participation). Callers that need
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

  const participates = eq(organisations.bm_participates, true);

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

    // 5 & 6. For each (target × period): resolve inputs → evaluate → persist,
    // wrapped in try/catch so a single failure doesn't abort the batch.
    for (const target of targets) {
      try {
        const scope: KpiWorkerScope = {
          reportPeriodId: period.id,
          organizationId: period.utilityId,
          serviceAreaId: null,
          unitId: null,
          customerTypeId: null,
          paymentModeId: null,
        };

        const resolvedInputs = await resolveFormulaInputValues({
          formulaInputs: target.formulaInputs,
          kpiAggLevelId: target.strataId,
          scope,
        });

        // No isPureAdditionFormula zero-fill here (that helper is private to
        // worker.ts): treat any missing input as a failure with a reason.
        if (resolvedInputs.missingVariables.length > 0) {
          result.failed += 1;
          result.byPeriod.push({
            reportPeriodId: period.id,
            kpiDefId: target.kpiDefId,
            status: "failed",
            reason: `Missing formula inputs: ${resolvedInputs.missingVariables.join(", ")}`,
          });
          continue;
        }

        const evaluation = evaluateKpiFormula(
          target.formula,
          resolvedInputs.variables,
        );
        if (evaluation.status === "error") {
          result.failed += 1;
          result.byPeriod.push({
            reportPeriodId: period.id,
            kpiDefId: target.kpiDefId,
            status: "failed",
            reason: evaluation.failureReason ?? "Formula evaluation failed.",
          });
          continue;
        }

        await upsertCalculatedKpiValue({
          reportPeriodId: period.id,
          kpiDefId: target.kpiDefId,
          actualValue: evaluation.value!,
          formulaVersion: target.formulaVersion,
          targetValue: target.targetValue,
        });

        result.processed += 1;
        result.byPeriod.push({
          reportPeriodId: period.id,
          kpiDefId: target.kpiDefId,
          status: "ok",
          value: evaluation.value,
        });
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
