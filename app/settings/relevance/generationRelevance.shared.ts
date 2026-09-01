type NamedDimension = {
  id: number;
  name: string;
};

type TypeSourceMapping = {
  unitTypeId: number;
  energySourceId: number;
};

export type GenerationTypeSourcePair = {
  unitTypeId: number;
  unitType: string;
  energySourceId: number;
  energySource: string;
};

export const buildGenerationTypeSourcePairs = (params: {
  unitTypes: NamedDimension[];
  energySources: NamedDimension[];
  mappings: TypeSourceMapping[];
}): GenerationTypeSourcePair[] => {
  const typeById = new Map(
    params.unitTypes.map((item) => [item.id, item.name]),
  );
  const sourceById = new Map(
    params.energySources.map((item) => [item.id, item.name]),
  );

  if (typeById.size === 0 || sourceById.size === 0) {
    return [];
  }

  const pairsFromMapping: GenerationTypeSourcePair[] = [];
  const pairKeys = new Set<string>();

  for (const mapping of params.mappings) {
    const unitType = typeById.get(mapping.unitTypeId);
    const energySource = sourceById.get(mapping.energySourceId);

    if (!unitType || !energySource) {
      continue;
    }

    const key = `${mapping.unitTypeId}:${mapping.energySourceId}`;
    if (pairKeys.has(key)) {
      continue;
    }

    pairKeys.add(key);
    pairsFromMapping.push({
      unitTypeId: mapping.unitTypeId,
      unitType,
      energySourceId: mapping.energySourceId,
      energySource,
    });
  }

  const pairs =
    params.mappings.length > 0
      ? pairsFromMapping
      : params.unitTypes.flatMap((unitType) =>
          params.energySources.map((energySource) => ({
            unitTypeId: unitType.id,
            unitType: unitType.name,
            energySourceId: energySource.id,
            energySource: energySource.name,
          })),
        );

  return pairs.sort((a, b) => {
    const byType = a.unitType.localeCompare(b.unitType);
    if (byType !== 0) {
      return byType;
    }

    return a.energySource.localeCompare(b.energySource);
  });
};
