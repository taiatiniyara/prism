export const DATA_ENTRY_FILTER_COOKIE_KEYS = {
  reportTypeId: "reportTypeId",
  reportPeriodId: "reportPeriodId",
  inputCategoryId: "inputCategoryId",
  inputSubcategoryId: "inputSubcategoryId",
  serviceAreaId: "serviceAreaId",
  dataEntryStatusId: "dataEntryStatusId",
} as const;

export type DataEntryFilterCookieKey =
  (typeof DATA_ENTRY_FILTER_COOKIE_KEYS)[keyof typeof DATA_ENTRY_FILTER_COOKIE_KEYS];

export interface DataEntryFilterContext {
  reportTypeId: number | null;
  reportPeriodId: number | null;
  inputCategoryId: number | null;
  inputSubcategoryId: number | null;
  serviceAreaId: number | null;
  dataEntryStatusId: number | null;
}

export const DEFAULT_DATA_ENTRY_FILTER_CONTEXT: DataEntryFilterContext = {
  reportTypeId: null,
  reportPeriodId: null,
  inputCategoryId: null,
  inputSubcategoryId: null,
  serviceAreaId: null,
  dataEntryStatusId: null,
};
