import { describe, expect, it } from "vitest";

import { buildGenerationGroups } from "@/app/data-entry/enter-data/services/us3.conditionalViews.service";

describe("generation grouping behavior", () => {
  it("groups definition rows under each non-virtual generator candidate", () => {
    const groups = buildGenerationGroups(
      [
        { id: 100, name: "Plant A", serviceAreaId: 10 },
        { id: 101, name: "Plant B", serviceAreaId: 10 },
      ],
      [
        {
          inputDefId: 1,
          inputName: "MWh",
          dataTypeId: 1,
          controlType: "number",
          value: null,
          comments: null,
        },
      ],
      [
        {
          id: "entry-1",
          inputDefId: 1,
          energyResourceId: 100,
          value: "24",
          comments: null,
        },
      ],
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.rows[0]?.value).toBe("24");
    expect(groups[1]?.rows[0]?.value).toBeNull();
  });
});
