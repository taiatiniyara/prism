import type { QueryFilterContext } from "./types";

export interface ContextResolutionResult {
  context: QueryFilterContext;
  warnings: string[];
}

interface ResolveContextInput {
  requestContext?: QueryFilterContext;
  sessionContext?: QueryFilterContext;
  roleDefaults?: QueryFilterContext;
}

const sanitizePositiveInt = (
  value: number | undefined,
  key: string,
  warnings: string[],
): number | undefined => {
  if (value == null) {
    return undefined;
  }

  if (!Number.isInteger(value) || value < 1) {
    warnings.push(`Ignored invalid ${key} value.`);
    return undefined;
  }

  return value;
};

export const resolveFilterContext = ({
  requestContext,
  sessionContext,
  roleDefaults,
}: ResolveContextInput): ContextResolutionResult => {
  const warnings: string[] = [];

  const reportPeriodId =
    sanitizePositiveInt(
      requestContext?.reportPeriodId,
      "reportPeriodId",
      warnings,
    ) ??
    sanitizePositiveInt(
      sessionContext?.reportPeriodId,
      "reportPeriodId",
      warnings,
    ) ??
    sanitizePositiveInt(
      roleDefaults?.reportPeriodId,
      "reportPeriodId",
      warnings,
    );

  const serviceAreaId =
    sanitizePositiveInt(
      requestContext?.serviceAreaId,
      "serviceAreaId",
      warnings,
    ) ??
    sanitizePositiveInt(
      sessionContext?.serviceAreaId,
      "serviceAreaId",
      warnings,
    ) ??
    sanitizePositiveInt(roleDefaults?.serviceAreaId, "serviceAreaId", warnings);

  return {
    context: {
      reportPeriodId,
      serviceAreaId,
    },
    warnings,
  };
};
