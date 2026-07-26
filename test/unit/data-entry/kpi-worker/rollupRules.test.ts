import { describe, expect, it } from "vitest";

import { sumRollupValues } from "@/app/data-entry/kpi-worker/resolveInputs";

describe("KPI roll-up rules", () => {
  it("sums report-period source values for higher KPI aggregation levels", () => {
    const rollup = sumRollupValues([
      {
        value: "10",
        isDeleted: false,
        isRelevant: true,
        energyProviderId: null,
        energyTypeId: null,
        energySourceId: null,
        energyResourceTypeId: null,
        customerTypeId: null,
        paymentModeId: null,
        consumptionBandId: null,
        divisionId: null,
        genderId: null,
        utilityFunctionId: null,
      },
      {
        value: "5.5",
        isDeleted: false,
        isRelevant: true,
        energyProviderId: null,
        energyTypeId: null,
        energySourceId: null,
        energyResourceTypeId: null,
        customerTypeId: null,
        paymentModeId: null,
        consumptionBandId: null,
        divisionId: null,
        genderId: null,
        utilityFunctionId: null,
      },
      {
        value: "ignored",
        isDeleted: false,
        isRelevant: true,
        energyProviderId: null,
        energyTypeId: null,
        energySourceId: null,
        energyResourceTypeId: null,
        customerTypeId: null,
        paymentModeId: null,
        consumptionBandId: null,
        divisionId: null,
        genderId: null,
        utilityFunctionId: null,
      },
    ]);

    expect(rollup.hasValue).toBe(true);
    expect(rollup.sum).toBeCloseTo(15.5);
  });
});
