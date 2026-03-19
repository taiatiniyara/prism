import { describe, expect, it } from "vitest";

import {
  sanitizeDependentFilterContext,
  sanitizePrimaryFilterContext,
} from "@/app/data-entry/enter-data/services/us1.contextPersistence.service";
import { buildFilterContextFixture } from "@/test/fixtures/data-entry-filters";

describe("stale unauthorized filter sanitization", () => {
  it("clears stale primary selections not available to current user", () => {
    const stale = buildFilterContextFixture({
      reportTypeId: 99,
      inputCategoryId: 88,
    });

    const sanitized = sanitizePrimaryFilterContext(stale, {
      reportTypes: [],
      inputCategories: [],
    });

    expect(sanitized.reportTypeId).toBeNull();
    expect(sanitized.inputCategoryId).toBeNull();
  });

  it("clears stale dependent selections when options are unauthorized", () => {
    const stale = buildFilterContextFixture({
      reportPeriodId: 999,
      inputSubcategoryId: 777,
      serviceAreaId: 666,
    });

    const sanitized = sanitizeDependentFilterContext(stale, {
      reportPeriods: [],
      inputSubcategories: [],
      serviceAreas: [],
    });

    expect(sanitized.reportPeriodId).toBeNull();
    expect(sanitized.inputSubcategoryId).toBeNull();
    expect(sanitized.serviceAreaId).toBeNull();
  });
});
