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
          unitName: "MWh",
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
          statusId: 1,
          updatedByName: "Test User",
          updatedByRole: "Admin",
          updatedAt: new Date(),
        },
      ],
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.rows[0]?.value).toBe("24");
    expect(groups[1]?.rows[0]?.value).toBeNull();
  });

  it("filters rows per generator using relevance criteria", () => {
    const groups = buildGenerationGroups(
      [
        {
          id: 100,
          name: "Plant A",
          serviceAreaId: 10,
          energyProviderId: 1,
          energySourceId: 11,
        },
        {
          id: 101,
          name: "Plant B",
          serviceAreaId: 10,
          energyProviderId: 2,
          energySourceId: 11,
        },
      ],
      [
        {
          inputDefId: 1,
          inputName: "MWh",
          unitName: "MWh",
          dataTypeId: 1,
          controlType: "number",
          value: null,
          comments: null,
        },
      ],
      [],
      (generator, definition) =>
        !(
          generator.energyProviderId === 1 &&
          generator.energySourceId === 11 &&
          definition.inputDefId === 1
        ),
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]?.rows).toHaveLength(0);
    expect(groups[1]?.rows).toHaveLength(1);
  });

  it("omits generators with no relevant rows when requested", () => {
    const groups = buildGenerationGroups(
      [
        {
          id: 100,
          name: "Plant A",
          serviceAreaId: 10,
          energyProviderId: 1,
          energySourceId: 11,
        },
        {
          id: 101,
          name: "Plant B",
          serviceAreaId: 10,
          energyProviderId: 2,
          energySourceId: 11,
        },
      ],
      [
        {
          inputDefId: 1,
          inputName: "MWh",
          unitName: "MWh",
          dataTypeId: 1,
          controlType: "number",
          value: null,
          comments: null,
        },
      ],
      [],
      (generator) => generator.energyProviderId !== 1,
      true,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.generatorId).toBe(101);
  });

  it("supports filtering by energy source relevance", () => {
    const groups = buildGenerationGroups(
      [
        {
          id: 100,
          name: "Hydro Plant",
          serviceAreaId: 10,
          energyProviderId: 1,
          energySourceId: 11,
        },
        {
          id: 101,
          name: "Gas Plant",
          serviceAreaId: 10,
          energyProviderId: 1,
          energySourceId: 12,
        },
      ],
      [
        {
          inputDefId: 1,
          inputName: "Generation Output",
          unitName: "MWh",
          dataTypeId: 1,
          controlType: "number",
          value: null,
          comments: null,
        },
      ],
      [],
      (generator, definition) =>
        !(definition.inputDefId === 1 && generator.energySourceId === 11),
      true,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.generatorName).toBe("Gas Plant");
  });
});
