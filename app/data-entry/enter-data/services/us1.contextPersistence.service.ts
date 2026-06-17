import { DataEntryFilterContext } from "@/app/data-entry/constants";
import {
  DataEntryFilterOption,
  DataEntryFilterOptions,
} from "@/app/data-entry/types";

const hasOption = (
  value: number | null,
  options: DataEntryFilterOption[] | undefined,
): boolean => value != null && (options?.some((option) => option.id === value) ?? false);

const getDefaultOptionValue = (
  options: DataEntryFilterOption[] | undefined,
): number | null => options?.[0]?.id ?? null;

const ensureValidOrDefault = (
  value: number | null,
  options: DataEntryFilterOption[] | undefined,
): number | null => {
  if (hasOption(value, options)) {
    return value;
  }

  return getDefaultOptionValue(options);
};

export const sanitizePrimaryFilterContext = (
  context: DataEntryFilterContext,
  options: Pick<DataEntryFilterOptions, "reportTypes" | "inputCategories">,
): DataEntryFilterContext => ({
  ...context,
  reportTypeId: ensureValidOrDefault(context.reportTypeId, options.reportTypes),
  inputCategoryId: ensureValidOrDefault(
    context.inputCategoryId,
    options.inputCategories,
  ),
});

export const sanitizeDependentFilterContext = (
  context: DataEntryFilterContext,
  options: Pick<
    DataEntryFilterOptions,
    "reportPeriods" | "inputSubcategories" | "serviceAreas" | "dataEntryStatuses"
  >,
): DataEntryFilterContext => ({
  ...context,
  reportPeriodId: ensureValidOrDefault(
    context.reportPeriodId,
    options.reportPeriods,
  ),
  inputSubcategoryId: ensureValidOrDefault(
    context.inputSubcategoryId,
    options.inputSubcategories,
  ),
  serviceAreaId: ensureValidOrDefault(
    context.serviceAreaId,
    options.serviceAreas,
  ),
  dataEntryStatusId: ensureValidOrDefault(
    context.dataEntryStatusId,
    options.dataEntryStatuses,
  ),
});

export const getOperationalCategoryId = (
  categories: DataEntryFilterOption[],
): number | null => {
  const operational = categories.find(
    (category) => category.name.trim().toLowerCase() === "operational",
  );

  return operational?.id ?? null;
};

export const getGenerationSubcategoryId = (
  subcategories: DataEntryFilterOption[],
): number | null => {
  const generation = subcategories.find(
    (subcategory) => subcategory.name.trim().toLowerCase() === "generation",
  );

  return generation?.id ?? null;
};
