import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import { inputDefinitions } from "@/db/schema/dataEntry";

export interface AggregatedFormulaTarget {
  inputDefId: number;
  formula: string;
  formulaInputs: Array<{ input_def_id: number; variable_name: string }>;
}

export const isEligibleAggregatedTarget = (target: {
  aggregated?: boolean;
  formula?: string | null;
}): boolean => {
  if (target.aggregated === false) {
    return false;
  }

  return Boolean(target.formula?.trim());
};

export const selectAggregatedFormulaTargets = async (): Promise<
  AggregatedFormulaTarget[]
> => {
  const rows = await db
    .select({
      inputDefId: inputDefinitions.id,
      formula: inputDefinitions.formula,
      formulaInputs: inputDefinitions.formula_inputs,
    })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.is_active, true),
        eq(inputDefinitions.is_aggregated, true),
        isNotNull(inputDefinitions.formula),
        ne(sql`trim(${inputDefinitions.formula})`, ""),
      ),
    );

  return rows.map((row) => ({
    inputDefId: row.inputDefId,
    formula: row.formula ?? "",
    formulaInputs: row.formulaInputs ?? [],
  }));
};
