import { describe, expect, it } from "vitest";

import { evaluateKpiFormula } from "@/app/data-entry/kpi-worker/evaluator";
import { mapFailureMessage } from "@/app/data-entry/kpi-worker/status.service";
import { sumRollupValues } from "@/app/data-entry/kpi-worker/resolveInputs";

describe("kpi worker regression coverage", () => {
  it("preserves expected roll-up, evaluation, and failure message behaviors", () => {
    const rollup = sumRollupValues([
      {
        value: "2",
        isDeleted: false,
        isRelevant: true,
        energyProviderId: null,
        energyTypeId: null,
        energySourceId: null,
        unitTypeId: null,
        customerTypeId: null,
        paymentModeId: null,
        consumptionBandId: null,
        divisionId: null,
        genderId: null,
        utilityFunctionId: null,
      },
      {
        value: "3",
        isDeleted: false,
        isRelevant: true,
        energyProviderId: null,
        energyTypeId: null,
        energySourceId: null,
        unitTypeId: null,
        customerTypeId: null,
        paymentModeId: null,
        consumptionBandId: null,
        divisionId: null,
        genderId: null,
        utilityFunctionId: null,
      },
    ]);
    expect(rollup.sum).toBe(5);

    const evaluation = evaluateKpiFormula("A + B", { A: 2, B: 3 });
    expect(evaluation.status).toBe("ok");
    expect(evaluation.value).toBe("5");

    expect(mapFailureMessage("failed", null)).toContain("Calculation failed");
  });
});
