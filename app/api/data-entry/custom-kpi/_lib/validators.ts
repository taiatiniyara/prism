export type CreateCustomKpiRequestInput = {
  title: string;
  description: string | null;
  formulaExpression: string;
  businessContext: string;
  selectedInputDefinitionIds: number[];
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
    formulaExpression: requireString(
      source.formulaExpression,
      "formulaExpression",
      2000,
    ),
    businessContext: requireString(
      source.businessContext,
      "businessContext",
      2000,
    ),
    selectedInputDefinitionIds: parseSelectedInputDefinitionIds(
      source.selectedInputDefinitionIds,
    ),
  };
};
