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

  const energyResourceId =
    sanitizePositiveInt(
      requestContext?.energyResourceId,
      "energyResourceId",
      warnings,
    ) ??
    sanitizePositiveInt(
      sessionContext?.energyResourceId,
      "energyResourceId",
      warnings,
    ) ??
    sanitizePositiveInt(
      roleDefaults?.energyResourceId,
      "energyResourceId",
      warnings,
    );

  const year =
    sanitizePositiveInt(requestContext?.year, "year", warnings) ??
    sanitizePositiveInt(sessionContext?.year, "year", warnings) ??
    sanitizePositiveInt(roleDefaults?.year, "year", warnings);

  const utilityId =
    sanitizePositiveInt(requestContext?.utilityId, "utilityId", warnings) ??
    sanitizePositiveInt(sessionContext?.utilityId, "utilityId", warnings) ??
    sanitizePositiveInt(roleDefaults?.utilityId, "utilityId", warnings);

  const utilityName =
    requestContext?.utilityName?.trim() ||
    sessionContext?.utilityName?.trim() ||
    roleDefaults?.utilityName?.trim() ||
    undefined;

  const runId =
    requestContext?.runId?.trim() ||
    sessionContext?.runId?.trim() ||
    roleDefaults?.runId?.trim() ||
    undefined;

  const renewableDefinition =
    requestContext?.renewableDefinition ??
    sessionContext?.renewableDefinition ??
    roleDefaults?.renewableDefinition;

  return {
    context: {
      reportPeriodId,
      serviceAreaId,
      energyResourceId,
      year,
      utilityId,
      utilityName,
      runId,
      renewableDefinition,
    },
    warnings,
  };
};
