import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import type { FormulaInput } from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";
import { reportPeriods } from "@/db/schema/reportPeriods";

import type { KpiWorkerScope } from "./types";

import { createFormulaVersionSnapshot } from "./snapshot";

export interface ResolvedKpiTarget {
  kpiDefId: number;
  aggLevelId: number | null;
  formula: string;
  formulaInputs: FormulaInput[];
  formulaVersion: string;
  targetValue: string | null;
}

interface KpiDefinitionLike {
  id: number;
  agg_level_id: number | null;
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
  month: number;
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

const toNullableNumber = (value: unknown): number | null => {
  if (value == null) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeFormulaInput = (input: FormulaInput): FormulaInput | null => {
  const inputDefId = toNullableNumber(
    (input as FormulaInput & { input_def_id?: unknown }).input_def_id,
  );

  if (inputDefId == null) {
    return null;
  }

  const energyProviderId = toNullableNumber(input.energy_provider_id);
  const energyTypeId = toNullableNumber(input.energy_type_id);
  const energySourceId = toNullableNumber(input.energy_source_id);

  return {
    ...input,
    input_def_id: inputDefId,
    ...(energyProviderId != null
      ? { energy_provider_id: energyProviderId }
      : {}),
    ...(energyTypeId != null ? { energy_type_id: energyTypeId } : {}),
    ...(energySourceId != null ? { energy_source_id: energySourceId } : {}),
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

      return formulaInputs.some((input) => input.input_def_id === inputDefId);
    })
    .map((definition) => {
      const formulaInputs = (definition.formula_inputs ?? [])
        .map(normalizeFormulaInput)
        .filter((input): input is FormulaInput => input != null);

      return {
        kpiDefId: definition.id,
        aggLevelId: definition.agg_level_id,
        formula: definition.formula!,
        formulaInputs,
        formulaVersion: createFormulaVersionSnapshot({
          kpiDefId: definition.id,
          formula: definition.formula!,
          formulaInputs,
        }),
        targetValue: resolveTargetValueForContext(
          definition.targets,
          targetContext,
        ),
      };
    });
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
      agg_level_id: kpiDefinitions.agg_level_id,
      is_active: kpiDefinitions.is_active,
      formula: kpiDefinitions.formula,
      formula_inputs: kpiDefinitions.formula_inputs,
      targets: kpiDefinitions.targets,
    })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.is_active, true));

  return filterAffectedKpiTargets(rows, inputDefId, targetContext);
};
