import { describe, expect, it } from "vitest";

import { buildGenerationTypeSourcePairs } from "@/app/settings/relevance/generationRelevance.shared";

describe("generation relevance type-source pairing", () => {
  const energyResourceTypes = [
    { id: 10, name: "Hydro" },
    { id: 20, name: "Solar" },
  ];

  const energySources = [
    { id: 100, name: "Run-of-river" },
    { id: 200, name: "Solar irradiation" },
  ];

  it("uses configured relevance mappings when provided", () => {
    const pairs = buildGenerationTypeSourcePairs({
      energyResourceTypes,
      energySources,
      mappings: [
        { energyResourceTypeId: 10, energySourceId: 100 },
        { energyResourceTypeId: 10, energySourceId: 100 }, // duplicate
        { energyResourceTypeId: 20, energySourceId: 200 },
      ],
    });

    expect(pairs).toEqual([
      {
        energyResourceTypeId: 10,
        energyResourceType: "Hydro",
        energySourceId: 100,
        energySource: "Run-of-river",
      },
      {
        energyResourceTypeId: 20,
        energyResourceType: "Solar",
        energySourceId: 200,
        energySource: "Solar irradiation",
      },
    ]);
  });

  it("falls back to cross-product pairs when no mappings exist", () => {
    const pairs = buildGenerationTypeSourcePairs({
      energyResourceTypes,
      energySources,
      mappings: [],
    });

    expect(pairs).toHaveLength(4);
    expect(pairs).toContainEqual({
      energyResourceTypeId: 10,
      energyResourceType: "Hydro",
      energySourceId: 100,
      energySource: "Run-of-river",
    });
    expect(pairs).toContainEqual({
      energyResourceTypeId: 20,
      energyResourceType: "Solar",
      energySourceId: 200,
      energySource: "Solar irradiation",
    });
  });
});
