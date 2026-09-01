import { describe, expect, it } from "vitest";

import {
  sanitizeDependentFilterContext,
  sanitizePrimaryFilterContext,
} from "@/app/data-entry/enter-data/services/us1.contextPersistence.service";
import {
  buildFilterContextFixture,
  buildFilterOptionsFixture,
} from "@/test/fixtures/data-entry-filters";

describe("context persistence sanitization", () => {
  it("keeps valid primary filter selections", () => {
    const context = buildFilterContextFixture({
      reportTypeId: 1,
      inputCategoryId: 515,
    });
    const options = buildFilterOptionsFixture();

    const result = sanitizePrimaryFilterContext(context, {
      reportTypes: options.reportTypes,
      inputCategories: options.inputCategories,
    });

    expect(result.reportTypeId).toBe(1);
    expect(result.inputCategoryId).toBe(515);
  });

  it("falls back to defaults when dependent selections are stale", () => {
    const context = buildFilterContextFixture({
      reportPeriodId: 999,
      inputSubcategoryId: 777,
      serviceAreaId: 888,
    });

    const result = sanitizeDependentFilterContext(context, {
      reportPeriods: [{ id: 101, name: "2026-01" }],
      inputSubcategories: [{ id: 600, name: "Generation" }],
      serviceAreas: [{ id: 10, name: "North Zone" }],
      dataEntryStatuses: [{ id: 1, name: "Pending" }],
    });

    expect(result.reportPeriodId).toBe(101);
    expect(result.inputSubcategoryId).toBe(600);
    expect(result.serviceAreaId).toBe(10);
  });
});
