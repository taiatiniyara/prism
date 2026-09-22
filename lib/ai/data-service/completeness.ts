import { listReviewKpiRows, getReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/service";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata, isOwnUtilityPeriodAccessible } from "./common";
import type { AiToolResult } from "../types";

export type CompletenessDimension =
  | "category"
  | "subcategory"
  | "service_area"
  | "technology"
  | "provider"
  | "energy_type"
  | "energy_resource"
  | "aggregation_level"
  | "customer_type"
  | "payment_mode";

// Only these dimensions are recorded per data-entry row today, so only these can
// produce a real per-item completeness split. The rest (technology, provider,
// energy_type, energy_resource, aggregation_level, customer_type, payment_mode) are
// tagged on measure/KPI *definitions*, not on individual data entries — that mapping
// lands with the medallion dimension redesign (db/schema/measureDimensionScope.ts),
// not yet applied to the DB. Until then, don't fabricate a per-item breakdown for them.
const ROW_LEVEL_DIMENSIONS = new Set<CompletenessDimension>([
  "category",
  "subcategory",
  "service_area",
]);

export interface CompletenessBreakdownItem {
  id?: number;
  name: string;
  count: number;
  percentage: number;
}

export interface CompletenessData {
  dimension: CompletenessDimension;
  items: CompletenessBreakdownItem[];
  total: number;
}

export const getCompletenessBreakdown = async (
  user: CurrentUser,
  dimension: CompletenessDimension,
  options: {
    report_period_id?: number | null;
  } = {},
): Promise<AiToolResult<CompletenessData>> => {
  if (!ROW_LEVEL_DIMENSIONS.has(dimension)) {
    return {
      data: { dimension, items: [], total: 0 },
      metadata: createToolMetadata({ source: `completeness_${dimension}` }),
      error: `Completeness breakdown by "${dimension}" isn't available yet — data entries aren't tagged with this dimension per row, only per KPI/measure definition. Use category, subcategory, or service_area instead.`,
    };
  }

  // Own-utility operational tool (#10 ruling): a report_period_id is trusted
  // straight into the row query below, so a non-global caller must not be able to
  // pass another utility's period. Reject a foreign/inaccessible period.
  if (
    options.report_period_id != null &&
    !(await isOwnUtilityPeriodAccessible(user, options.report_period_id))
  ) {
    return {
      data: { dimension, items: [], total: 0 },
      metadata: createToolMetadata({ source: `completeness_${dimension}` }),
      error:
        "Completeness is scoped to your own utility; that report period isn't available to you.",
    };
  }

  const filterOptions = await getReviewKpiFilterOptions(user, {
    reportTypeId: null,
    reportPeriodId: options.report_period_id ?? null,
    kpiCategoryId: null,
    kpiSubcategoryId: null,
    serviceAreaId: null,
  });

  let items: CompletenessBreakdownItem[] = [];

  switch (dimension) {
    case "category":
      items = filterOptions.kpiCategories.map((i) => ({ id: i.id, name: i.name, count: 0, percentage: 0 }));
      break;
    case "subcategory":
      items = filterOptions.kpiSubcategories.map((i) => ({ id: i.id, name: i.name, count: 0, percentage: 0 }));
      break;
    case "service_area":
      items = filterOptions.serviceAreas.map((i) => ({ id: i.id, name: i.name, count: 0, percentage: 0 }));
      break;
  }

  if (items.length > 0 && options.report_period_id) {
    const rows = await listReviewKpiRows({
      reportTypeId: null,
      reportPeriodId: options.report_period_id,
      kpiCategoryId: null,
      kpiSubcategoryId: null,
      serviceAreaId: null,
    });

    for (const item of items) {
      const matching = rows.filter((r) => {
        switch (dimension) {
          case "category": return r.categoryId === item.id;
          case "subcategory": return r.subcategoryId === item.id;
          case "service_area": return r.serviceAreaId === item.id;
          default: return false;
        }
      });
      const completed = matching.filter((r) => r.result.status === "calculated").length;
      item.count = matching.length;
      item.percentage = item.count > 0 ? Math.round((completed / item.count) * 100) : 0;
    }
  }

  return {
    data: { dimension, items, total: items.length },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: items.length > 0
        ? Math.round(items.reduce((s, i) => s + i.percentage, 0) / items.length)
        : 0,
      source: `completeness_${dimension}`,
    }),
  };
};
