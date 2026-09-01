type ManagedListNameItem = {
  id: number;
  name: string;
};

export const buildManagedListNameMap = (
  items: ManagedListNameItem[],
): Map<number, string> => {
  return new Map(items.map((item) => [item.id, item.name]));
};

export const resolveManagedListName = (
  namesById: Map<number, string>,
  id: number | null | undefined,
  fallback: string | null,
): string | null => {
  if (id == null) {
    return fallback;
  }

  return namesById.get(id) ?? fallback;
};
