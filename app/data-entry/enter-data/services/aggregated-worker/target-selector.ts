import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import { measureDefinitions } from "@/db/schema/dataEntry";

export interface AggregatedFormulaTarget {
  inputDefId: number;
  variableName?: string | null;
  formula: string;
  formulaInputs: Array<{ measure_def_id: number; variable_name: string }>;
}

interface FormulaInputCandidate {
  inputDefId: number;
  variableName: string;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isIdentifier = (value: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);

export const inferFormulaInputs = (
  formula: string,
  candidates: FormulaInputCandidate[],
): Array<{ measure_def_id: number; variable_name: string }> => {
  if (!formula.trim() || candidates.length === 0) {
    return [];
  }

  const occupiedRanges: Array<[number, number]> = [];
  const inferred: Array<{ measure_def_id: number; variable_name: string }> = [];

  const orderedCandidates = [...candidates].sort(
    (left, right) => right.variableName.length - left.variableName.length,
  );

  const overlaps = (start: number, end: number): boolean =>
    occupiedRanges.some(
      ([existingStart, existingEnd]) =>
        start < existingEnd && existingStart < end,
    );

  for (const candidate of orderedCandidates) {
    /* eslint-disable security/detect-non-literal-regexp -- variableName is sanitized via escapeRegExp before constructing the RegExp */
    const pattern = isIdentifier(candidate.variableName)
      ? new RegExp(`\\b${escapeRegExp(candidate.variableName)}\\b`, "g")
      : new RegExp(escapeRegExp(candidate.variableName), "g");
    /* eslint-enable security/detect-non-literal-regexp */

    let match = pattern.exec(formula);
    while (match) {
      const start = match.index;
      const end = start + candidate.variableName.length;

      if (!overlaps(start, end)) {
        occupiedRanges.push([start, end]);
        inferred.push({
          measure_def_id: candidate.inputDefId,
          variable_name: candidate.variableName,
        });
        break;
      }

      match = pattern.exec(formula);
    }
  }

  return inferred;
};

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
      inputDefId: measureDefinitions.id,
      variableName: measureDefinitions.variable_name,
      formula: measureDefinitions.formula,
      formulaInputs: measureDefinitions.formula_inputs,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        // Calculated measures are flagged is_calculated (set by the formula
        // builder). This replaced the legacy is_aggregated flag — the two
        // meant the same thing; is_aggregated is being retired (#2).
        eq(measureDefinitions.is_calculated, true),
        isNotNull(measureDefinitions.formula),
        ne(sql`trim(${measureDefinitions.formula})`, ""),
      ),
    );

  const variableRows = await db
    .select({
      inputDefId: measureDefinitions.id,
      variableName: measureDefinitions.variable_name,
    })
    .from(measureDefinitions)
    .where(
      and(
        eq(measureDefinitions.is_active, true),
        isNotNull(measureDefinitions.variable_name),
        ne(sql`trim(${measureDefinitions.variable_name})`, ""),
      ),
    );

  const candidates: FormulaInputCandidate[] = variableRows.map((row) => ({
    inputDefId: row.inputDefId,
    variableName: row.variableName ?? "",
  }));

  return rows.map((row) => ({
    inputDefId: row.inputDefId,
    variableName: row.variableName,
    formula: row.formula ?? "",
    formulaInputs:
      row.formulaInputs && row.formulaInputs.length > 0
        ? row.formulaInputs
        : inferFormulaInputs(row.formula ?? "", candidates),
  }));
};
