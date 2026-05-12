type NamedDimension = {
  id: number;
  name: string;
};

type TypeSourceMapping = {
  energyResourceTypeId: number;
  energySourceId: number;
};

export type GenerationTypeSourcePair = {
  energyResourceTypeId: number;
  energyResourceType: string;
  energySourceId: number;
  energySource: string;
};

export const buildGenerationTypeSourcePairs = (params: {
  energyResourceTypes: NamedDimension[];
  energySources: NamedDimension[];
  mappings: TypeSourceMapping[];
}): GenerationTypeSourcePair[] => {
  const typeById = new Map(
    params.energyResourceTypes.map((item) => [item.id, item.name]),
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
    const energyResourceType = typeById.get(mapping.energyResourceTypeId);
    const energySource = sourceById.get(mapping.energySourceId);

    if (!energyResourceType || !energySource) {
      continue;
    }

    const key = `${mapping.energyResourceTypeId}:${mapping.energySourceId}`;
    if (pairKeys.has(key)) {
      continue;
    }

    pairKeys.add(key);
    pairsFromMapping.push({
      energyResourceTypeId: mapping.energyResourceTypeId,
      energyResourceType,
      energySourceId: mapping.energySourceId,
      energySource,
    });
  }

  const pairs =
    params.mappings.length > 0
      ? pairsFromMapping
      : params.energyResourceTypes.flatMap((energyResourceType) =>
          params.energySources.map((energySource) => ({
            energyResourceTypeId: energyResourceType.id,
            energyResourceType: energyResourceType.name,
            energySourceId: energySource.id,
            energySource: energySource.name,
          })),
        );

  return pairs.sort((a, b) => {
    const byType = a.energyResourceType.localeCompare(b.energyResourceType);
    if (byType !== 0) {
      return byType;
    }

    return a.energySource.localeCompare(b.energySource);
  });
};
