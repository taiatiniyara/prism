export type ReviewDecisionType = "APPROVE" | "REJECT" | "REPLACE";

export type ReviewDecisionInput = {
  decisionType: ReviewDecisionType;
  rationale: string;
  replacementKpiId: number | null;
  categoryId: number | null;
  subcategoryId: number | null;
  proposedUnits: Array<{
    name: string;
    description: string | null;
    existingUnitId: number | null;
  }>;
  proposedInputs: Array<{
    name: string;
    description: string | null;
    unit: string;
    dataType: string;
    existingInputId: number | null;
  }>;
  override: boolean;
  priorDecisionId: string | null;
};

const optionalString = (value: unknown, max = 255): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, max);
};

const parsePositiveIntOrNull = (value: unknown): number | null => {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
};

export const parseRequestIdParam = (requestId: string | undefined): string => {
  const normalized = requestId?.trim() ?? "";
  if (!normalized) {
    throw new Error("VALIDATION:requestId is required.");
  }

  return normalized;
};

export const parseReviewDecisionPayload = (
  payload: unknown,
): ReviewDecisionInput => {
  if (typeof payload !== "object" || payload == null) {
    throw new Error("VALIDATION:Payload must be an object.");
  }

  const source = payload as Record<string, unknown>;
  const decisionType = source.decisionType;
  if (
    decisionType !== "APPROVE" &&
    decisionType !== "REJECT" &&
    decisionType !== "REPLACE"
  ) {
    throw new Error(
      "VALIDATION:decisionType must be APPROVE, REJECT, or REPLACE.",
    );
  }

  const rationale =
    typeof source.rationale === "string" ? source.rationale.trim() : "";
  if (rationale.length === 0) {
    throw new Error("VALIDATION:rationale is required.");
  }

  let replacementKpiId: number | null = null;
  if (source.replacementKpiId != null) {
    if (typeof source.replacementKpiId === "number") {
      replacementKpiId =
        Number.isInteger(source.replacementKpiId) && source.replacementKpiId > 0
          ? source.replacementKpiId
          : null;
    } else if (
      typeof source.replacementKpiId === "string" &&
      source.replacementKpiId.trim().length > 0
    ) {
      const parsed = Number.parseInt(source.replacementKpiId.trim(), 10);
      replacementKpiId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }
  }

  if (decisionType === "REPLACE" && replacementKpiId == null) {
    throw new Error("VALIDATION:replacementKpiId is required for REPLACE.");
  }

  const categoryId = parsePositiveIntOrNull(source.categoryId);
  const subcategoryId = parsePositiveIntOrNull(source.subcategoryId);

  const proposedUnits = Array.isArray(source.proposedUnits)
    ? source.proposedUnits
        .map((item) => {
          if (typeof item !== "object" || item == null) {
            return null;
          }

          const value = item as Record<string, unknown>;
          const name = optionalString(value.name);
          if (!name) {
            return null;
          }

          return {
            name,
            description: optionalString(value.description),
            existingUnitId: parsePositiveIntOrNull(value.existingUnitId),
          };
        })
        .filter(
          (
            item,
          ): item is {
            name: string;
            description: string | null;
            existingUnitId: number | null;
          } => Boolean(item),
        )
    : [];

  const proposedInputs = Array.isArray(source.proposedInputs)
    ? source.proposedInputs
        .map((item) => {
          if (typeof item !== "object" || item == null) {
            return null;
          }

          const value = item as Record<string, unknown>;
          const name = optionalString(value.name);
          const unit = optionalString(value.unit);
          const dataType = optionalString(value.dataType);
          if (!name || !unit || !dataType) {
            return null;
          }

          return {
            name,
            description: optionalString(value.description),
            unit,
            dataType,
            existingInputId: parsePositiveIntOrNull(value.existingInputId),
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
            existingInputId: number | null;
          } => Boolean(item),
        )
    : [];

  if (decisionType === "APPROVE") {
    if (categoryId == null) {
      throw new Error("VALIDATION:categoryId is required for APPROVE.");
    }

    if (subcategoryId == null) {
      throw new Error("VALIDATION:subcategoryId is required for APPROVE.");
    }
  }

  const priorDecisionId =
    typeof source.priorDecisionId === "string" &&
    source.priorDecisionId.trim().length > 0
      ? source.priorDecisionId.trim()
      : null;

  const override = source.override === true;

  if (override && priorDecisionId == null) {
    throw new Error("VALIDATION:priorDecisionId is required for overrides.");
  }

  return {
    decisionType,
    rationale,
    replacementKpiId,
    categoryId,
    subcategoryId,
    proposedUnits,
    proposedInputs,
    override,
    priorDecisionId,
  };
};
