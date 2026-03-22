import { createHash } from "node:crypto";

import type { FormulaInput } from "@/db/schema/dataEntry";

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
