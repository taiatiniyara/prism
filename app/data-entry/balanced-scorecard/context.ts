import type { ScorecardFilterContext } from "@/app/data-entry/balanced-scorecard/types";

const toPositiveIntOrNull = (value: number | null): number | null => {
  if (value == null) {
    return null;
  }

  return Number.isInteger(value) && value > 0 ? value : null;
};

export const sanitizeScorecardFilterContext = (
  context: ScorecardFilterContext,
): ScorecardFilterContext => {
  const sanitized: ScorecardFilterContext = {
    reportPeriodId: toPositiveIntOrNull(context.reportPeriodId) ?? 0,
    reportTypeId: toPositiveIntOrNull(context.reportTypeId),
    serviceAreaId: toPositiveIntOrNull(context.serviceAreaId),
    kpiCategoryId: toPositiveIntOrNull(context.kpiCategoryId),
    kpiSubcategoryId: toPositiveIntOrNull(context.kpiSubcategoryId),
  };

  if (sanitized.kpiCategoryId == null) {
    sanitized.kpiSubcategoryId = null;
  }

  return sanitized;
};
