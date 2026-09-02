import { createHash } from "node:crypto";

import type { FormulaInput } from "@/db/schema/dataEntry";

/**
 * A stable hash of a formula definition — its owner id, formula text and input
 * bindings. Stamped onto computed values so a definition change versions the
 * history rather than silently rewriting it.
 */
interface SnapshotSource {
  kpiDefId: number;
  formula: string;
  formulaInputs: FormulaInput[];
}

export const createFormulaVersionSnapshot = (
  source: SnapshotSource,
): string => {
  const payload = JSON.stringify({
    kpiDefId: source.kpiDefId,
    formula: source.formula,
    formulaInputs: source.formulaInputs,
  });

  return createHash("sha256").update(payload).digest("hex");
};
