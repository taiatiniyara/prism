import type { AggregatedFormulaTarget } from "@/app/data-entry/enter-data/services/aggregated-worker/target-selector";

export const buildAggregatedTarget = (
  overrides: Partial<AggregatedFormulaTarget> = {},
): AggregatedFormulaTarget => ({
  inputDefId: 1001,
  formula: "A + B",
  formulaInputs: [
    { measure_def_id: 11, variable_name: "A" },
    { measure_def_id: 12, variable_name: "B" },
  ],
  ...overrides,
});

export const buildVariableValues = (
  overrides: Record<string, string | null | undefined> = {},
): Record<string, string | null | undefined> => ({
  A: "10",
  B: "15",
  ...overrides,
});
