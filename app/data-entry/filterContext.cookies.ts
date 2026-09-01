"use server";

import {
  DATA_ENTRY_FILTER_COOKIE_KEYS,
  DEFAULT_DATA_ENTRY_FILTER_CONTEXT,
  DataEntryFilterContext,
  DataEntryFilterCookieKey,
} from "@/app/data-entry/constants";
import { sanitizeFilterContext } from "@/app/data-entry/filterContext.utils";
import { cookies } from "next/headers";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type DataEntryFilterContextInput = {
  [K in keyof DataEntryFilterContext]?: number | string | null;
};

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
      dataEntryStatusId: cookieStore.get(
        DATA_ENTRY_FILTER_COOKIE_KEYS.dataEntryStatusId,
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
    setFilterCookie(
      DATA_ENTRY_FILTER_COOKIE_KEYS.dataEntryStatusId,
      safe.dataEntryStatusId,
    ),
  ]);
};
