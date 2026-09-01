import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/connection";
import type { FormulaInput } from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";

import { normalizeFormulaInput } from "./normalizeFormulaInput";
import type { KpiWorkerScope } from "./types";

import { createFormulaVersionSnapshot } from "./snapshot";

export interface ResolvedKpiTarget {
  kpiDefId: number;
  strataId: number | null;
  formula: string;
  formulaInputs: FormulaInput[];
  formulaVersion: string;
  targetValue: string | null;
}

interface KpiDefinitionLike {
  id: number;
  strata_id: number | null;
  is_active: boolean;
  formula: string | null;
  formula_inputs: FormulaInput[] | null;
  targets:
    | {
        utility_id: number;
        year: number;
        month?: number | null;
        target_value: string;
      }[]
    | null;
}

interface TargetResolutionContext {
  utilityId: number | null;
  year: number;
  month: number | null;
}

const resolveTargetValueForContext = (
  targets: KpiDefinitionLike["targets"],
  context: TargetResolutionContext,
): string | null => {
  if (!targets || context.utilityId == null) {
    return null;
  }

  const utilityTargets = targets.filter(
    (item) =>
      item.utility_id === context.utilityId &&
      item.year === context.year &&
      item.target_value?.trim(),
  );

  if (utilityTargets.length === 0) {
    return null;
  }

  const monthlyTarget = utilityTargets.find(
    (item) => item.month === context.month,
  );
  if (monthlyTarget) {
    return monthlyTarget.target_value;
  }

  const yearlyTarget = utilityTargets.find((item) => item.month == null);
  return yearlyTarget?.target_value ?? null;
};

/**
 * Build a `ResolvedKpiTarget` from a single active KPI definition row. Assumes
 * the definition carries a non-null formula (callers filter for this first).
 * Shared by `filterAffectedKpiTargets` (input-triggered) and
 * `resolveKpiTargetsByIds` (KPI-triggered) so both derive identical targets.
 */
const toResolvedTarget = (
  definition: KpiDefinitionLike,
  ctx: TargetResolutionContext,
): ResolvedKpiTarget => {
  const formulaInputs = (definition.formula_inputs ?? [])
    .map(normalizeFormulaInput)
    .filter((input): input is FormulaInput => input != null);

  return {
    kpiDefId: definition.id,
    strataId: definition.strata_id,
    formula: definition.formula!,
    formulaInputs,
    formulaVersion: createFormulaVersionSnapshot({
      kpiDefId: definition.id,
      formula: definition.formula!,
      formulaInputs,
    }),
    targetValue: resolveTargetValueForContext(definition.targets, ctx),
  };
};

export const filterAffectedKpiTargets = (
  definitions: KpiDefinitionLike[],
  inputDefId: number,
  targetContext: TargetResolutionContext,
): ResolvedKpiTarget[] => {
  return definitions
    .filter((definition) => {
      if (!definition.is_active || !definition.formula) {
        return false;
      }

      const formulaInputs = (definition.formula_inputs ?? [])
        .map(normalizeFormulaInput)
        .filter((input): input is FormulaInput => input != null);
      if (formulaInputs.length === 0) {
        return false;
      }

      return formulaInputs.some((input) => input.measure_def_id === inputDefId);
    })
    .map((definition) => toResolvedTarget(definition, targetContext));
};

export const resolveAffectedKpiTargets = async (
  inputDefId: number,
  scope: KpiWorkerScope,
): Promise<ResolvedKpiTarget[]> => {
  const [reportPeriod] = await db
    .select({
      utilityId: reportPeriods.utility_id,
      reportDate: reportPeriods.report_date,
    })
    .from(reportPeriods)
    .where(eq(reportPeriods.id, scope.reportPeriodId))
    .limit(1);

  const reportDate = reportPeriod?.reportDate ?? new Date();
  const targetContext: TargetResolutionContext = {
    utilityId: scope.organizationId ?? reportPeriod?.utilityId ?? null,
    year: reportDate.getFullYear(),
    month: reportDate.getMonth() + 1,
  };

  const rows = await db
    .select({
      id: kpiDefinitions.id,
      strata_id: kpiDefinitions.strata_id,
      is_active: kpiDefinitions.is_active,
      formula: kpiDefinitions.formula,
      formula_inputs: kpiDefinitions.formula_inputs,
      targets: kpiDefinitions.targets,
    })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.is_active, true));

  return filterAffectedKpiTargets(rows, inputDefId, targetContext);
};

/**
 * Resolve KPI targets for a set of KPI definition ids directly (as opposed to
 * `resolveAffectedKpiTargets`, which discovers KPIs from a changed input). Used
 * by the manual "Compute now" recompute path. Only active definitions that
 * carry a non-empty formula produce a target; others are skipped.
 */
export const resolveKpiTargetsByIds = async (
  kpiDefIds: number[],
  ctx: { utilityId: number; year: number; month?: number | null },
): Promise<ResolvedKpiTarget[]> => {
  if (kpiDefIds.length === 0) {
    return [];
  }

  const targetContext: TargetResolutionContext = {
    utilityId: ctx.utilityId,
    year: ctx.year,
    month: ctx.month ?? null,
  };

  const rows = await db
    .select({
      id: kpiDefinitions.id,
      strata_id: kpiDefinitions.strata_id,
      is_active: kpiDefinitions.is_active,
      formula: kpiDefinitions.formula,
      formula_inputs: kpiDefinitions.formula_inputs,
      targets: kpiDefinitions.targets,
    })
    .from(kpiDefinitions)
    .where(
      and(
        eq(kpiDefinitions.is_active, true),
        inArray(kpiDefinitions.id, kpiDefIds),
      ),
    );

  return rows
    .filter((row) => Boolean(row.formula))
    .map((row) => toResolvedTarget(row, targetContext));
};
