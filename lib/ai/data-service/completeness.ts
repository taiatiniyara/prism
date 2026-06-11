import { listReviewKpiRows, getReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/service";
import { db } from "@/db/connection";
import { managedListItems } from "@/db/schema/managedLists";
import { eq, and } from "drizzle-orm";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata, MANAGED_LIST_PARENT_IDS } from "./common";
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

const fetchManagedListItems = async (parentId?: number | null) => {
  const conds = [];
  if (parentId != null) conds.push(eq(managedListItems.parent_id, parentId));
  const rows = await db
    .select({ id: managedListItems.id, name: managedListItems.name })
    .from(managedListItems)
    .where(conds.length ? and(...conds) : undefined)
    .limit(200);
  return rows;
};

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
    case "energy_source": {
      const sources = await fetchManagedListItems(MANAGED_LIST_PARENT_IDS.ENERGY_SOURCE);
      items = sources.map((i) => ({ name: i.name, count: 0, percentage: 0 }));
      break;
    }
    case "energy_provider": {
      const providers = await fetchManagedListItems(MANAGED_LIST_PARENT_IDS.ENERGY_PROVIDER);
      items = providers.map((i) => ({ name: i.name, count: 0, percentage: 0 }));
      break;
    }
    case "energy_type": {
      const types = await fetchManagedListItems(MANAGED_LIST_PARENT_IDS.ENERGY_TYPE);
      items = types.map((i) => ({ name: i.name, count: 0, percentage: 0 }));
      break;
    }
    case "energy_resource": {
      const resources = await fetchManagedListItems(MANAGED_LIST_PARENT_IDS.ENERGY_RESOURCE);
      items = resources.map((i) => ({ name: i.name, count: 0, percentage: 0 }));
      break;
    }
    case "aggregation_level": {
      const levels = await fetchManagedListItems(MANAGED_LIST_PARENT_IDS.AGGREGATION_LEVEL);
      items = levels.map((i) => ({ name: i.name, count: 0, percentage: 0 }));
      break;
    }
    case "customer_type": {
      const types = await fetchManagedListItems(MANAGED_LIST_PARENT_IDS.CUSTOMER_TYPE);
      items = types.map((i) => ({ name: i.name, count: 0, percentage: 0 }));
      break;
    }
    case "payment_mode": {
      const modes = await fetchManagedListItems(MANAGED_LIST_PARENT_IDS.PAYMENT_MODE);
      items = modes.map((i) => ({ name: i.name, count: 0, percentage: 0 }));
      break;
    }
    default:
      items = [];
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
          default: return r.result.status !== null;
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
