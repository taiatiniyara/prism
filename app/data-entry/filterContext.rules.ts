import {
  DEFAULT_DATA_ENTRY_FILTER_CONTEXT,
  DataEntryFilterContext,
} from "@/app/data-entry/constants";

type FilterKey = keyof DataEntryFilterContext;

const DEPENDENT_RESETS: Record<FilterKey, FilterKey[]> = {
  reportTypeId: ["reportPeriodId"],
  reportPeriodId: [],
  inputCategoryId: ["inputSubcategoryId", "serviceAreaId"],
  inputSubcategoryId: [],
  serviceAreaId: [],
  dataEntryStatusId: [],
};

export const applyFilterCascade = (
  current: DataEntryFilterContext,
  changedKey: FilterKey,
  nextValue: number | null,
): DataEntryFilterContext => {
  const next: DataEntryFilterContext = {
    ...DEFAULT_DATA_ENTRY_FILTER_CONTEXT,
    ...current,
    [changedKey]: nextValue,
  };

  for (const dependentKey of DEPENDENT_RESETS[changedKey]) {
    next[dependentKey] = null;
  }

  return next;
};

export const applyOperationalVisibilityRule = (
  context: DataEntryFilterContext,
  operationalCategoryId: number | null,
): DataEntryFilterContext => {
  if (operationalCategoryId == null) {
    return context;
  }

  if (context.inputCategoryId !== operationalCategoryId) {
    return {
      ...context,
      serviceAreaId: null,
    };
  }

  return context;
};
