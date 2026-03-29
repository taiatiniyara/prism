import type {
  ScorecardFilterContext,
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
    reportPeriodId: parsePositiveInt(params, "reportPeriodId", true) as number,
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

export const parseScorecardUpdatePayload = (
  body: unknown,
): ScorecardUpdatePayload => {
  if (!isPlainObject(body)) {
    throw new Error("VALIDATION:Request body must be an object.");
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

  const objective =
    typeof body.objective === "string" ? body.objective.trim() : "";
  if (objective.length === 0) {
    throw new Error("VALIDATION:objective is required.");
  }

  if (!isPlainObject(body.target)) {
    throw new Error("VALIDATION:target is required.");
  }

  const year = Number(body.target.year);
  if (!Number.isInteger(year) || year < 1900 || year > 3000) {
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

  const targetValue =
    typeof body.target.targetValue === "number"
      ? String(body.target.targetValue)
      : typeof body.target.targetValue === "string"
        ? body.target.targetValue.trim()
        : "";

  if (targetValue.length === 0) {
    throw new Error("VALIDATION:target.targetValue is required.");
  }

  return {
    kpiId,
    kpiDefinitionId,
    perspectiveLevel: perspectiveLevel as 1 | 2 | 3 | 4,
    objective,
    target: {
      year,
      month,
      targetValue,
    },
  };
};
