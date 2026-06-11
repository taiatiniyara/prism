import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/db/connection";
import { inputDefinitions } from "@/db/schema/dataEntry";

export interface AggregatedFormulaTarget {
  inputDefId: number;
  variableName?: string | null;
  formula: string;
  formulaInputs: Array<{ input_def_id: number; variable_name: string }>;
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
): Array<{ input_def_id: number; variable_name: string }> => {
  if (!formula.trim() || candidates.length === 0) {
    return [];
  }

  const occupiedRanges: Array<[number, number]> = [];
  const inferred: Array<{ input_def_id: number; variable_name: string }> = [];

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
          input_def_id: candidate.inputDefId,
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
      inputDefId: inputDefinitions.id,
      variableName: inputDefinitions.variable_name,
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

  const variableRows = await db
    .select({
      inputDefId: inputDefinitions.id,
      variableName: inputDefinitions.variable_name,
    })
    .from(inputDefinitions)
    .where(
      and(
        eq(inputDefinitions.is_active, true),
        isNotNull(inputDefinitions.variable_name),
        ne(sql`trim(${inputDefinitions.variable_name})`, ""),
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
