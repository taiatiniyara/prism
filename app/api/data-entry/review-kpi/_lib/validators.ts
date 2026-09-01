import { ReviewKpiFilterContext } from "@/app/data-entry/review-kpi/types";

const parseNumber = (
  value: string | null,
  field: string,
  required = false,
): number | null => {
  if (value == null || value.trim() === "") {
    if (required) {
      throw new Error(`VALIDATION:${field} is required.`);
    }

    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`VALIDATION:${field} must be a valid number.`);
  }

  return parsed;
};

export const parseReviewKpiFilterContext = (
  searchParams: URLSearchParams,
): ReviewKpiFilterContext => ({
  reportTypeId: parseNumber(searchParams.get("reportTypeId"), "reportTypeId"),
  reportPeriodId: parseNumber(
    searchParams.get("reportPeriodId"),
    "reportPeriodId",
    true,
  ),
  kpiCategoryId: parseNumber(
    searchParams.get("kpiCategoryId"),
    "kpiCategoryId",
  ),
  kpiSubcategoryId: parseNumber(
    searchParams.get("kpiSubcategoryId"),
    "kpiSubcategoryId",
  ),
  serviceAreaId: parseNumber(
    searchParams.get("serviceAreaId"),
    "serviceAreaId",
  ),
});

export const parseRequiredUuid = (
  value: string | undefined,
  field: string,
): string => {
  if (!value || value.trim().length === 0) {
    throw new Error(`VALIDATION:${field} is required.`);
  }

  return value;
};

export const parseOptionalSinceEventId = (
  value: string | null,
): string | null => {
  if (value == null || value.trim() === "") {
    return null;
  }

  return value;
};

export const parseUpdateInputPayload = (payload: unknown) => {
  if (typeof payload !== "object" || payload == null) {
    throw new Error("VALIDATION:Payload must be an object.");
  }

  const value = "value" in payload ? (payload as { value?: unknown }).value : null;
  const updatedAt =
    "updatedAt" in payload
      ? (payload as { updatedAt?: unknown }).updatedAt
      : undefined;

  if (typeof updatedAt !== "string" || updatedAt.trim().length === 0) {
    throw new Error("VALIDATION:updatedAt is required.");
  }

  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error("VALIDATION:updatedAt must be a valid ISO date.");
  }

  if (!(value == null || typeof value === "string")) {
    throw new Error("VALIDATION:value must be a string or null.");
  }

  return {
    value: value == null ? null : value,
    updatedAt,
  };
};

export const parseAddCommentPayload = (payload: unknown) => {
  if (typeof payload !== "object" || payload == null) {
    throw new Error("VALIDATION:Payload must be an object.");
  }

  const comment =
    "comment" in payload
      ? (payload as { comment?: unknown }).comment
      : undefined;

  if (typeof comment !== "string" || comment.trim().length === 0) {
    throw new Error("VALIDATION:comment is required.");
  }

  return {
    comment: comment.trim(),
  };
};
