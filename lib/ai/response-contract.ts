import type {
  AiQueryResponse,
  AttributionItem,
  MetricItem,
  RowItem,
} from "./types";

const isMetricItem = (value: unknown): value is MetricItem => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<MetricItem>;
  return (
    typeof item.label === "string" &&
    (typeof item.value === "string" || typeof item.value === "number")
  );
};

const isAttributionItem = (value: unknown): value is AttributionItem => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<AttributionItem>;
  return (
    typeof item.sourceName === "string" &&
    (item.sourceType === "SERVICE_FUNCTION" || item.sourceType === "DATASET") &&
    typeof item.sourceRef === "string"
  );
};

const isRowItem = (value: unknown): value is RowItem => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

export const validateAiQueryResponse = (
  value: unknown,
): value is AiQueryResponse => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<AiQueryResponse>;

  if (
    typeof payload.traceId !== "string" ||
    typeof payload.summary !== "string"
  ) {
    return false;
  }

  if (!Array.isArray(payload.metrics) || !payload.metrics.every(isMetricItem)) {
    return false;
  }

  if (!Array.isArray(payload.rows) || !payload.rows.every(isRowItem)) {
    return false;
  }

  if (
    !Array.isArray(payload.attribution) ||
    !payload.attribution.every(isAttributionItem)
  ) {
    return false;
  }

  if (!payload.export) {
    return false;
  }

  return (
    typeof payload.export.pdfAvailable === "boolean" &&
    typeof payload.export.csvAvailable === "boolean"
  );
};
