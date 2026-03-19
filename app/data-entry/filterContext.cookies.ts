import {
  DATA_ENTRY_FILTER_COOKIE_KEYS,
  DEFAULT_DATA_ENTRY_FILTER_CONTEXT,
  DataEntryFilterContext,
  DataEntryFilterCookieKey,
} from "@/app/data-entry/constants";
import { cookies } from "next/headers";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

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
});

export const getFilterContextFromCookies =
  async (): Promise<DataEntryFilterContext> => {
    const cookieStore = await cookies();

    return sanitizeFilterContext({
      reportTypeId: cookieStore.get(DATA_ENTRY_FILTER_COOKIE_KEYS.reportTypeId)
        ?.value,
      reportPeriodId: cookieStore.get(
        DATA_ENTRY_FILTER_COOKIE_KEYS.reportPeriodId,
      )?.value,
      inputCategoryId: cookieStore.get(
        DATA_ENTRY_FILTER_COOKIE_KEYS.inputCategoryId,
      )?.value,
      inputSubcategoryId: cookieStore.get(
        DATA_ENTRY_FILTER_COOKIE_KEYS.inputSubcategoryId,
      )?.value,
      serviceAreaId: cookieStore.get(
        DATA_ENTRY_FILTER_COOKIE_KEYS.serviceAreaId,
      )?.value,
    });
  };

export const setFilterCookie = async (
  key: DataEntryFilterCookieKey,
  value: number | null,
) => {
  const cookieStore = await cookies();

  if (value == null) {
    cookieStore.delete(key);
    return;
  }

  cookieStore.set(key, String(value), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: ONE_YEAR_SECONDS,
  });
};

export const saveFilterContextToCookies = async (
  context: DataEntryFilterContextInput,
) => {
  const safe = sanitizeFilterContext({
    ...DEFAULT_DATA_ENTRY_FILTER_CONTEXT,
    ...context,
  });

  await Promise.all([
    setFilterCookie(
      DATA_ENTRY_FILTER_COOKIE_KEYS.reportTypeId,
      safe.reportTypeId,
    ),
    setFilterCookie(
      DATA_ENTRY_FILTER_COOKIE_KEYS.reportPeriodId,
      safe.reportPeriodId,
    ),
    setFilterCookie(
      DATA_ENTRY_FILTER_COOKIE_KEYS.inputCategoryId,
      safe.inputCategoryId,
    ),
    setFilterCookie(
      DATA_ENTRY_FILTER_COOKIE_KEYS.inputSubcategoryId,
      safe.inputSubcategoryId,
    ),
    setFilterCookie(
      DATA_ENTRY_FILTER_COOKIE_KEYS.serviceAreaId,
      safe.serviceAreaId,
    ),
  ]);
};
