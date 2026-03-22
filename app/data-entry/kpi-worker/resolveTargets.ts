import { eq } from "drizzle-orm";

import { db } from "@/db/connection";
import type { FormulaInput } from "@/db/schema/dataEntry";
import { kpiDefinitions } from "@/db/schema/kpi";

import { createFormulaVersionSnapshot } from "./snapshot";

export interface ResolvedKpiTarget {
  kpiDefId: number;
  aggLevelId: number | null;
  formula: string;
  formulaInputs: FormulaInput[];
  formulaVersion: string;
}

interface KpiDefinitionLike {
  id: number;
  agg_level_id: number | null;
  is_active: boolean;
  formula: string | null;
  formula_inputs: FormulaInput[] | null;
}

export const filterAffectedKpiTargets = (
  definitions: KpiDefinitionLike[],
  inputDefId: number,
): ResolvedKpiTarget[] => {
  return definitions
    .filter((definition) => {
      if (!definition.is_active || !definition.formula) {
        return false;
      }

      const formulaInputs = definition.formula_inputs ?? [];
      if (formulaInputs.length === 0) {
        return false;
      }

      return formulaInputs.some((input) => input.input_def_id === inputDefId);
    })
    .map((definition) => {
      const formulaInputs = definition.formula_inputs ?? [];

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
      };
    });
};

export const resolveAffectedKpiTargets = async (
  inputDefId: number,
): Promise<ResolvedKpiTarget[]> => {
  const rows = await db
    .select({
      id: kpiDefinitions.id,
      agg_level_id: kpiDefinitions.agg_level_id,
      is_active: kpiDefinitions.is_active,
      formula: kpiDefinitions.formula,
      formula_inputs: kpiDefinitions.formula_inputs,
    })
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.is_active, true));

  return filterAffectedKpiTargets(rows, inputDefId);
};
