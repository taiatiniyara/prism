import type {
  ScorecardFilterContext,
  ScorecardRelationship,
  ScorecardRelationshipsUpdatePayload,
  ScorecardUpdatePayload,
} from "@/app/data-entry/balanced-scorecard/types";

const parsePositiveInt = (
  params: URLSearchParams,
  key: string,
  required = false,
): number | null => {
  const raw = params.get(key);
  if (raw == null || raw === "") {
    if (required) {
      throw new Error(`VALIDATION:${key} is required.`);
    }
    return null;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`VALIDATION:${key} must be a positive integer.`);
  }

  return value;
};

export const parseScorecardFilterContext = (
  params: URLSearchParams,
): ScorecardFilterContext => {
  const context: ScorecardFilterContext = {
    reportPeriodId: parsePositiveInt(params, "reportPeriodId") ?? 0,
    reportTypeId: parsePositiveInt(params, "reportTypeId"),
    serviceAreaId: parsePositiveInt(params, "serviceAreaId"),
    kpiCategoryId: parsePositiveInt(params, "kpiCategoryId"),
    kpiSubcategoryId: parsePositiveInt(params, "kpiSubcategoryId"),
  };

  if (context.kpiSubcategoryId != null && context.kpiCategoryId == null) {
    throw new Error(
      "VALIDATION:kpiSubcategoryId requires kpiCategoryId in the same request.",
    );
  }

  return context;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

const parseRelationshipNodeRef = (
  raw: unknown,
  fieldName: string,
): ScorecardRelationship["source"] => {
  if (!isPlainObject(raw)) {
    throw new Error(`VALIDATION:${fieldName} must be an object.`);
  }

  const level = raw.level;
  if (
    level !== "perspective" &&
    level !== "objective" &&
    level !== "initiative" &&
    level !== "kpi"
  ) {
    throw new Error(`VALIDATION:${fieldName}.level is invalid.`);
  }

  const perspectiveLevel = Number(raw.perspectiveLevel);
  if (![1, 2, 3, 4].includes(perspectiveLevel)) {
    throw new Error(`VALIDATION:${fieldName}.perspectiveLevel is invalid.`);
  }

  const objectiveDescription =
    typeof raw.objectiveDescription === "string"
      ? raw.objectiveDescription.trim()
      : undefined;
  const keyInitiativeDescription =
    typeof raw.keyInitiativeDescription === "string"
      ? raw.keyInitiativeDescription.trim()
      : undefined;
  const kpiId =
    raw.kpiId == null || raw.kpiId === ""
      ? undefined
      : Number.isInteger(Number(raw.kpiId))
        ? Number(raw.kpiId)
        : NaN;

  if (kpiId != null && (!Number.isInteger(kpiId) || kpiId <= 0)) {
    throw new Error(
      `VALIDATION:${fieldName}.kpiId must be a positive integer.`,
    );
  }

  return {
    level,
    perspectiveLevel: perspectiveLevel as 1 | 2 | 3 | 4,
    objectiveDescription,
    keyInitiativeDescription,
    kpiId,
  };
};

const parseRelationships = (
  raw: unknown,
): ScorecardRelationship[] | undefined => {
  if (raw == null) {
    return undefined;
  }

  if (!Array.isArray(raw)) {
    throw new Error("VALIDATION:relationships must be an array.");
  }

  return raw.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new Error(`VALIDATION:relationships[${index}] must be an object.`);
    }

    const id =
      typeof item.id === "string" && item.id.trim().length > 0
        ? item.id.trim()
        : null;
    if (id == null) {
      throw new Error(`VALIDATION:relationships[${index}].id is required.`);
    }

    const relationshipType = item.relationshipType;
    if (
      relationshipType !== "influences" &&
      relationshipType !== "depends_on" &&
      relationshipType !== "contributes_to" &&
      relationshipType !== "blocks"
    ) {
      throw new Error(
        `VALIDATION:relationships[${index}].relationshipType is invalid.`,
      );
    }

    const source = parseRelationshipNodeRef(
      item.source,
      `relationships[${index}].source`,
    );
    const target = parseRelationshipNodeRef(
      item.target,
      `relationships[${index}].target`,
    );

    const weight =
      item.weight == null || item.weight === ""
        ? undefined
        : Number(item.weight);
    if (weight != null && !Number.isFinite(weight)) {
      throw new Error(`VALIDATION:relationships[${index}].weight is invalid.`);
    }

    const note =
      typeof item.note === "string" && item.note.trim().length > 0
        ? item.note.trim()
        : undefined;

    return {
      id,
      source,
      target,
      relationshipType,
      weight,
      note,
    };
  });
};

export const parseScorecardRelationshipsUpdatePayload = (
  body: unknown,
): ScorecardRelationshipsUpdatePayload => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }

  const reportPeriodId = Number(body.reportPeriodId);
  if (!Number.isInteger(reportPeriodId) || reportPeriodId <= 0) {
    throw new Error("VALIDATION:reportPeriodId must be a positive integer.");
  }

  const relationships = parseRelationships(body.relationships);

  return {
    reportPeriodId,
    relationships: relationships ?? [],
  };
};
export const parseScorecardUpdatePayload = (
  body: unknown,
): ScorecardUpdatePayload => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
  }

  const reportPeriodId =
    body.reportPeriodId == null || body.reportPeriodId === ""
      ? undefined
      : Number(body.reportPeriodId);

  if (
    reportPeriodId != null &&
    (!Number.isInteger(reportPeriodId) || reportPeriodId <= 0)
  ) {
    throw new Error("VALIDATION:reportPeriodId must be a positive integer.");
  }

  const kpiId =
    typeof body.kpiId === "string" && body.kpiId.trim().length > 0
      ? body.kpiId.trim()
      : null;

  const kpiDefinitionId = Number(body.kpiDefinitionId);
  if (!Number.isInteger(kpiDefinitionId) || kpiDefinitionId <= 0) {
    throw new Error("VALIDATION:kpiDefinitionId must be a positive integer.");
  }

  const perspectiveLevel = Number(body.perspectiveLevel);
  if (![1, 2, 3, 4].includes(perspectiveLevel)) {
    throw new Error("VALIDATION:perspectiveLevel must be 1, 2, 3, or 4.");
  }

  const perspectiveDescription =
    typeof body.perspectiveDescription === "string"
      ? body.perspectiveDescription.trim()
      : "";

  const strategicObjective =
    typeof body.strategicObjective === "string"
      ? body.strategicObjective.trim()
      : typeof body.objective === "string"
        ? body.objective.trim()
        : "";
  if (strategicObjective.length === 0) {
    throw new Error("VALIDATION:strategicObjective is required.");
  }

  const keyInitiative =
    typeof body.keyInitiative === "string" ? body.keyInitiative.trim() : "";
  if (keyInitiative.length === 0) {
    throw new Error("VALIDATION:keyInitiative is required.");
  }

  const trackingFrequency =
    body.trackingFrequency === "monthly" ||
    body.trackingFrequency === "annually"
      ? body.trackingFrequency
      : "monthly";

  if (!isPlainObject(body.target)) {
    throw new Error("VALIDATION:target is required.");
  }

  const rawYear = body.target.year;
  const year =
    rawYear == null || rawYear === "" ? undefined : Number(body.target.year);
  if (year != null && (!Number.isInteger(year) || year < 1900 || year > 3000)) {
    throw new Error("VALIDATION:target.year must be a valid year.");
  }

  const rawMonth = body.target.month;
  const month =
    rawMonth == null || rawMonth === ""
      ? null
      : Number.isInteger(Number(rawMonth))
        ? Number(rawMonth)
        : NaN;

  if (month != null && (!Number.isInteger(month) || month < 1 || month > 12)) {
    throw new Error("VALIDATION:target.month must be between 1 and 12.");
  }

  if (reportPeriodId == null && year == null) {
    throw new Error(
      "VALIDATION:Either reportPeriodId or target.year is required.",
    );
  }

  const targetValue =
    typeof body.target.targetValue === "number"
      ? String(body.target.targetValue)
      : typeof body.target.targetValue === "string"
        ? body.target.targetValue.trim()
        : "";

  if (targetValue.length === 0) {
    throw new Error("VALIDATION:target.targetValue is required.");
  }

  const relationships = parseRelationships(body.relationships);

  return {
    reportPeriodId,
    kpiId,
    kpiDefinitionId,
    perspectiveLevel: perspectiveLevel as 1 | 2 | 3 | 4,
    perspectiveDescription,
    strategicObjective,
    keyInitiative,
    trackingFrequency,
    target: {
      year,
      month,
      targetValue,
    },
    relationships,
  };
};
