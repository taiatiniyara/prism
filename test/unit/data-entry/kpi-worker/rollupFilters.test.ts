import { describe, expect, it } from "vitest";

import { sumRollupValues } from "@/app/data-entry/kpi-worker/resolveInputs";

describe("kpi roll-up inclusion filters", () => {
  it("includes only rows where is_deleted=false and is_relevant=true", () => {
    const result = sumRollupValues([
      {
        value: "12",
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
        value: "5",
        isDeleted: true,
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
        value: "9",
        isDeleted: false,
        isRelevant: false,
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

    expect(result.hasValue).toBe(true);
    expect(result.sum).toBe(12);
  });
});
