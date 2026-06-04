import { getReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/service";
import type { CurrentUser } from "@/lib/user.service";
import { createToolMetadata } from "./common";
import type { AiToolResult } from "../types";

export interface ConfigurationOption {
  id: number;
  name: string;
}

export interface ConfigurationData {
  report_types: ConfigurationOption[];
  report_periods: ConfigurationOption[];
  kpi_categories: ConfigurationOption[];
  kpi_subcategories: ConfigurationOption[];
  service_areas: ConfigurationOption[];
}

export const getConfigurationOptions = async (
  user: CurrentUser,
): Promise<AiToolResult<ConfigurationData>> => {
  const options = await getReviewKpiFilterOptions(user, {
    reportTypeId: null,
    reportPeriodId: null,
    kpiCategoryId: null,
    kpiSubcategoryId: null,
    serviceAreaId: null,
  });

  return {
    data: {
      report_types: options.reportTypes.map((item) => ({
        id: item.id,
        name: item.name,
      })),
      report_periods: options.reportPeriods.map((item) => ({
        id: item.id,
        name: item.name,
      })),
      kpi_categories: options.kpiCategories.map((item) => ({
        id: item.id,
        name: item.name,
      })),
      kpi_subcategories: options.kpiSubcategories.map((item) => ({
        id: item.id,
        name: item.name,
      })),
      service_areas: options.serviceAreas.map((item) => ({
        id: item.id,
        name: item.name,
      })),
    },
    metadata: createToolMetadata({
      freshness: new Date(),
      completeness_pct: 100,
      source: "filter_options",
    }),
  };
};
