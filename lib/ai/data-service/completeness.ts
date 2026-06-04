import { getReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/service";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export type CompletenessDimension =
  | "category"
  | "subcategory"
  | "service_area"
  | "energy_source"
  | "energy_provider"
  | "energy_type"
  | "energy_resource"
  | "aggregation_level"
  | "customer_type"
  | "payment_mode";

export interface CompletenessBreakdownItem {
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
  const filterOptions = await getReviewKpiFilterOptions(user, {
    reportTypeId: null,
    reportPeriodId: options.report_period_id ?? null,
    kpiCategoryId: null,
    kpiSubcategoryId: null,
    serviceAreaId: null,
  });

  let items: CompletenessBreakdownItem[] = [];
  let total = 0;

  switch (dimension) {
    case "category":
      items = filterOptions.kpiCategories.map((item) => ({
        name: item.name,
        count: 1,
        percentage: 0,
      }));
      break;
    case "subcategory":
      items = filterOptions.kpiSubcategories.map((item) => ({
        name: item.name,
        count: 1,
        percentage: 0,
      }));
      break;
    case "service_area":
      items = filterOptions.serviceAreas.map((item) => ({
        name: item.name,
        count: 1,
        percentage: 0,
      }));
      break;
    default:
      items = [];
  }

  total = items.length;

  if (total > 0) {
    const equalPercentage = 100 / total;
    items = items.map((item) => ({
      ...item,
      percentage: equalPercentage,
    }));
  }

  return {
    data: {
      dimension,
      items,
      total,
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: total > 0 ? 100 : 0,
      source: `filter_options_${dimension}`,
    }),
  };
};
