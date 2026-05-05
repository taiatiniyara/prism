export type CreateCustomKpiRequestInput = {
  title: string;
  description: string | null;
  isPrivate: boolean;
  formulaExpression: string;
  unitId: number;
  proposedUnits: Array<{ name: string; description: string | null }>;
  proposedInputs: Array<{
    name: string;
    description: string | null;
    unit: string;
    dataType: string;
  }>;
  selectedInputDefinitionIds: number[];
};

const requirePositiveInteger = (value: unknown, field: string): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`VALIDATION:${field} must be a positive integer.`);
  }

  return parsed;
};

const requireString = (value: unknown, field: string, max = 2000): string => {
  if (typeof value !== "string") {
    throw new Error(`VALIDATION:${field} is required.`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`VALIDATION:${field} is required.`);
  }

  if (trimmed.length > max) {
    throw new Error(`VALIDATION:${field} exceeds max length ${max}.`);
  }

  return trimmed;
};

const optionalString = (value: unknown, max = 2000): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, max);
};

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return false;
};

const parseSelectedInputDefinitionIds = (value: unknown): number[] => {
  if (typeof value === "undefined") {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("VALIDATION:selectedInputDefinitionIds must be an array.");
  }

  const ids = value
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (ids.length !== value.length) {
    throw new Error(
      "VALIDATION:selectedInputDefinitionIds must contain only positive integer IDs.",
    );
  }

  return [...new Set(ids)];
};

const parseProposedUnits = (
  value: unknown,
): Array<{ name: string; description: string | null }> => {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("VALIDATION:proposedUnits must be an array.");
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item == null) {
        return null;
      }

      const source = item as Record<string, unknown>;
      const name = optionalString(source.name, 255);
      if (!name) {
        return null;
      }

      return {
        name,
        description: optionalString(source.description, 255),
      };
    })
    .filter((item): item is { name: string; description: string | null } =>
      Boolean(item),
    );
};

const parseProposedInputs = (
  value: unknown,
): Array<{
  name: string;
  description: string | null;
  unit: string;
  dataType: string;
}> => {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("VALIDATION:proposedInputs must be an array.");
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item == null) {
        return null;
      }

      const source = item as Record<string, unknown>;
      const name = optionalString(source.name, 255);
      const unit = optionalString(source.unit, 255);
      const dataType = optionalString(source.dataType, 255);
      if (!name || !unit || !dataType) {
        return null;
      }

      return {
        name,
        description: optionalString(source.description, 255),
        unit,
        dataType,
      };
    })
    .filter(
      (
        item,
      ): item is {
        name: string;
        description: string | null;
        unit: string;
        dataType: string;
      } => Boolean(item),
    );
};

export const parseCreateCustomKpiRequestPayload = (
  payload: unknown,
): CreateCustomKpiRequestInput => {
  if (typeof payload !== "object" || payload == null) {
    throw new Error("VALIDATION:Payload must be an object.");
  }

  const source = payload as Record<string, unknown>;

  const description =
    typeof source.description === "string" &&
    source.description.trim().length > 0
      ? source.description.trim()
      : null;

  return {
    title: requireString(source.title, "title", 160),
    description,
    isPrivate: parseBoolean(source.isPrivate),
    formulaExpression: requireString(
      source.formulaExpression,
      "formulaExpression",
      2000,
    ),
    unitId: requirePositiveInteger(source.unitId, "unitId"),
    proposedUnits: parseProposedUnits(source.proposedUnits),
    proposedInputs: parseProposedInputs(source.proposedInputs),
    selectedInputDefinitionIds: parseSelectedInputDefinitionIds(
      source.selectedInputDefinitionIds,
    ),
  };
};
