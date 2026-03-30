import {
  ReviewKpiFilterContext,
  ReviewKpiPageViewModel,
} from "@/app/data-entry/review-kpi/types";

export const reviewKpiFilterFixture: ReviewKpiFilterContext = {
  reportTypeId: 1,
  reportPeriodId: 202401,
  kpiCategoryId: 515,
  kpiSubcategoryId: 600,
  serviceAreaId: 10,
};

export const reviewKpiPageFixture: ReviewKpiPageViewModel = {
  context: reviewKpiFilterFixture,
  options: {
    reportTypes: [{ id: 1, name: "Monthly" }],
    reportPeriods: [{ id: 202401, name: "Jan 2024" }],
    kpiCategories: [{ id: 515, name: "Operations" }],
    kpiSubcategories: [{ id: 600, name: "Service Delivery" }],
    serviceAreas: [{ id: 10, name: "North" }],
  },
  rows: [
    {
      kpiDefId: 1001,
      kpiName: "First Pass Resolution",
      unitName: null,
      formulaText: "resolved / total",
      categoryId: 515,
      subcategoryId: 600,
      reportPeriodId: 202401,
      serviceAreaId: 10,
      inputs: [
        {
          dataEntryId: "7f57dbf7-85d8-40e7-adf1-8882f4f87142",
          inputDefId: 9001,
          inputName: "Resolved Requests",
          unitName: null,
          value: "80",
          controlType: "number",
          comments: [],
          updatedAt: "2026-03-24T00:00:00.000Z",
          updatedById: "u-1",
        },
      ],
      result: {
        kpiId: "099f9535-4f19-4664-8422-c4e16073b4ad",
        value: "0.80",
        status: "calculated",
        calculatedAt: "2026-03-24T00:00:00.000Z",
        formulaVersion: "v1",
      },
    },
  ],
};
