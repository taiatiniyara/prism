export type DataEntryValidationMetadata = {
  inputName: string;
  isMandatory: boolean;
  dataTypeName: string | null;
  isCurrency: boolean;
  validRangeMin: number | null;
  validRangeMax: number | null;
  validPolarityId: number | null;
  validPolarityName: string | null;
};

const normalizeTypeName = (typeName: string | null | undefined) =>
  (typeName ?? "").trim().toLowerCase();

const normalizeNumericCandidate = (value: string) =>
  value.trim().replace(/\$/g, "").replace(/,/g, "");

const parseNumericCandidate = (value: string): number | null => {
  const normalized = normalizeNumericCandidate(value);
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

export const isValueValidForDataType = (
  dataTypeName: string | null,
  value: string | null,
): boolean => {
  if (value == null || value.trim().length === 0) {
    return true;
  }

  const normalized = normalizeTypeName(dataTypeName);

  if (
    normalized.includes("number") ||
    normalized.includes("decimal") ||
    normalized.includes("int")
  ) {
    return parseNumericCandidate(value) !== null;
  }

  if (normalized.includes("bool")) {
    const boolValue = value.trim().toLowerCase();
    return ["true", "false", "yes", "no", "1", "0"].includes(boolValue);
  }

  if (normalized.includes("date")) {
    return !Number.isNaN(Date.parse(value.trim()));
  }

  return true;
};

export const getDataTypeValidationMessage = (
  metadata: Pick<DataEntryValidationMetadata, "inputName" | "dataTypeName">,
) => `${metadata.inputName} expects ${metadata.dataTypeName || "a valid value"}.`;

const resolvePolarityRule = (
  validPolarityId: number | null,
  validPolarityName: string | null,
): "positive" | "negative" | "non-zero" | null => {
  if (validPolarityId === 130) {
    return "positive";
  }
  if (validPolarityId === 131) {
    return "negative";
  }
  if (validPolarityId === 132) {
    return "non-zero";
  }

  const normalized = normalizeTypeName(validPolarityName);
  if (normalized.includes("non-zero") || normalized.includes("non zero")) {
    return "non-zero";
  }
  if (normalized.includes("non-positive")) {
    return "negative";
  }
  if (normalized.includes("non-negative")) {
    return "positive";
  }
  if (normalized.includes("cannot be zero")) {
    return "non-zero";
  }
  if (normalized.includes("positive")) {
    return "positive";
  }
  if (normalized.includes("negative")) {
    return "negative";
  }

  return null;
};

const CURRENCY_MAX_RANGE = 999999999999;

export const getRangeOrPolarityValidationMessage = (
  metadata: DataEntryValidationMetadata,
  value: string | null,
): string | null => {
  if (value == null || value.trim().length === 0) {
    return null;
  }

  const numericValue = parseNumericCandidate(value);
  if (numericValue === null) {
    return null;
  }

  const effectiveRangeMax = metadata.isCurrency
    ? Math.max(metadata.validRangeMax ?? 0, CURRENCY_MAX_RANGE)
    : metadata.validRangeMax;

  if (
    metadata.validRangeMin != null &&
    numericValue < Number(metadata.validRangeMin)
  ) {
    return `${metadata.inputName} must be greater than or equal to ${metadata.validRangeMin}.`;
  }

  if (
    effectiveRangeMax != null &&
    numericValue > Number(effectiveRangeMax)
  ) {
    return `${metadata.inputName} must be less than or equal to ${effectiveRangeMax}.`;
  }

  const polarityRule = resolvePolarityRule(
    metadata.validPolarityId,
    metadata.validPolarityName,
  );

  if (polarityRule === "positive" && numericValue < 0) {
    return `${metadata.inputName} cannot be negative.`;
  }
  if (polarityRule === "negative" && numericValue > 0) {
    return `${metadata.inputName} cannot be positive.`;
  }
  if (polarityRule === "non-zero" && numericValue === 0) {
    return `${metadata.inputName} cannot be zero.`;
  }

  return null;
};
