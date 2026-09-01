import { ReviewKpiFilterContext } from "@/app/data-entry/review-kpi/types";
import { cookies } from "next/headers";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const REVIEW_KPI_FILTER_COOKIE_KEYS = {
  reportTypeId: "reviewKpiReportTypeId",
  reportPeriodId: "reviewKpiReportPeriodId",
  kpiCategoryId: "reviewKpiCategoryId",
  kpiSubcategoryId: "reviewKpiSubcategoryId",
  serviceAreaId: "reviewKpiServiceAreaId",
} as const;

type ReviewKpiFilterCookieKey =
  (typeof REVIEW_KPI_FILTER_COOKIE_KEYS)[keyof typeof REVIEW_KPI_FILTER_COOKIE_KEYS];

type ReviewKpiFilterContextInput = {
  [K in keyof ReviewKpiFilterContext]?: number | string | null;
};

const parseNullableInt = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const sanitizeReviewKpiFilterCookieContext = (
  context: ReviewKpiFilterContextInput,
): ReviewKpiFilterContext => ({
  reportTypeId: parseNullableInt(
    context.reportTypeId == null ? undefined : String(context.reportTypeId),
  ),
  reportPeriodId: parseNullableInt(
    context.reportPeriodId == null ? undefined : String(context.reportPeriodId),
  ),
  kpiCategoryId: parseNullableInt(
    context.kpiCategoryId == null ? undefined : String(context.kpiCategoryId),
  ),
  kpiSubcategoryId: parseNullableInt(
    context.kpiSubcategoryId == null
      ? undefined
      : String(context.kpiSubcategoryId),
  ),
  serviceAreaId: parseNullableInt(
    context.serviceAreaId == null ? undefined : String(context.serviceAreaId),
  ),
});

export const getReviewKpiFilterContextFromCookies =
  async (): Promise<ReviewKpiFilterContext> => {
    const cookieStore = await cookies();

    return sanitizeReviewKpiFilterCookieContext({
      reportTypeId: cookieStore.get(REVIEW_KPI_FILTER_COOKIE_KEYS.reportTypeId)
        ?.value,
      reportPeriodId: cookieStore.get(
        REVIEW_KPI_FILTER_COOKIE_KEYS.reportPeriodId,
      )?.value,
      kpiCategoryId: cookieStore.get(
        REVIEW_KPI_FILTER_COOKIE_KEYS.kpiCategoryId,
      )?.value,
      kpiSubcategoryId: cookieStore.get(
        REVIEW_KPI_FILTER_COOKIE_KEYS.kpiSubcategoryId,
      )?.value,
      serviceAreaId: cookieStore.get(
        REVIEW_KPI_FILTER_COOKIE_KEYS.serviceAreaId,
      )?.value,
    });
  };

const setReviewKpiFilterCookie = async (
  key: ReviewKpiFilterCookieKey,
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

export const saveReviewKpiFilterContextToCookies = async (
  context: ReviewKpiFilterContextInput,
) => {
  const safe = sanitizeReviewKpiFilterCookieContext(context);

  await Promise.all([
    setReviewKpiFilterCookie(
      REVIEW_KPI_FILTER_COOKIE_KEYS.reportTypeId,
      safe.reportTypeId,
    ),
    setReviewKpiFilterCookie(
      REVIEW_KPI_FILTER_COOKIE_KEYS.reportPeriodId,
      safe.reportPeriodId,
    ),
    setReviewKpiFilterCookie(
      REVIEW_KPI_FILTER_COOKIE_KEYS.kpiCategoryId,
      safe.kpiCategoryId,
    ),
    setReviewKpiFilterCookie(
      REVIEW_KPI_FILTER_COOKIE_KEYS.kpiSubcategoryId,
      safe.kpiSubcategoryId,
    ),
    setReviewKpiFilterCookie(
      REVIEW_KPI_FILTER_COOKIE_KEYS.serviceAreaId,
      safe.serviceAreaId,
    ),
  ]);
};
