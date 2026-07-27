import { describe, expect, it } from "vitest";

import { buildGenerationTypeSourcePairs } from "@/app/settings/relevance/generationRelevance.shared";

describe("generation relevance type-source pairing", () => {
  const unitTypes = [
    { id: 10, name: "Hydro" },
    { id: 20, name: "Solar" },
  ];

  const energySources = [
    { id: 100, name: "Run-of-river" },
    { id: 200, name: "Solar irradiation" },
  ];

  it("uses configured relevance mappings when provided", () => {
    const pairs = buildGenerationTypeSourcePairs({
      unitTypes,
      energySources,
      mappings: [
        { unitTypeId: 10, energySourceId: 100 },
        { unitTypeId: 10, energySourceId: 100 }, // duplicate
        { unitTypeId: 20, energySourceId: 200 },
      ],
    });

    expect(pairs).toEqual([
      {
        unitTypeId: 10,
        unitType: "Hydro",
        energySourceId: 100,
        energySource: "Run-of-river",
      },
      {
        unitTypeId: 20,
        unitType: "Solar",
        energySourceId: 200,
        energySource: "Solar irradiation",
      },
    ]);
  });

  it("falls back to cross-product pairs when no mappings exist", () => {
    const pairs = buildGenerationTypeSourcePairs({
      unitTypes,
      energySources,
      mappings: [],
    });

    expect(pairs).toHaveLength(4);
    expect(pairs).toContainEqual({
      unitTypeId: 10,
      unitType: "Hydro",
      energySourceId: 100,
      energySource: "Run-of-river",
    });
    expect(pairs).toContainEqual({
      unitTypeId: 20,
      unitType: "Solar",
      energySourceId: 200,
      energySource: "Solar irradiation",
    });
  });
});
