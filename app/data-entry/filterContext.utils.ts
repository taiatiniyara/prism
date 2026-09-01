import {
  DataEntryFilterContext,
} from "@/app/data-entry/constants";

type DataEntryFilterContextInput = {
  [K in keyof DataEntryFilterContext]?: number | string | null;
};

const parseNullableInt = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const sanitizeFilterContext = (
  context: DataEntryFilterContextInput,
): DataEntryFilterContext => ({
  reportTypeId: parseNullableInt(
    context.reportTypeId == null ? undefined : String(context.reportTypeId),
  ),
  reportPeriodId: parseNullableInt(
    context.reportPeriodId == null ? undefined : String(context.reportPeriodId),
  ),
  inputCategoryId: parseNullableInt(
    context.inputCategoryId == null
      ? undefined
      : String(context.inputCategoryId),
  ),
  inputSubcategoryId: parseNullableInt(
    context.inputSubcategoryId == null
      ? undefined
      : String(context.inputSubcategoryId),
  ),
  serviceAreaId: parseNullableInt(
    context.serviceAreaId == null ? undefined : String(context.serviceAreaId),
  ),
  dataEntryStatusId: parseNullableInt(
    context.dataEntryStatusId == null
      ? undefined
      : String(context.dataEntryStatusId),
  ),
});
