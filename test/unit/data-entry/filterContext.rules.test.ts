import { describe, expect, it } from "vitest";

import { applyFilterCascade } from "@/app/data-entry/filterContext.rules";
import { buildFilterContextFixture } from "@/test/fixtures/data-entry-filters";

describe("applyFilterCascade", () => {
  it("resets report period when report type changes", () => {
    const current = buildFilterContextFixture({
      reportTypeId: 1,
      reportPeriodId: 101,
      inputCategoryId: 515,
      inputSubcategoryId: 600,
      serviceAreaId: 10,
    });

    const next = applyFilterCascade(current, "reportTypeId", 2);

    expect(next.reportTypeId).toBe(2);
    expect(next.reportPeriodId).toBeNull();
    expect(next.inputCategoryId).toBe(515);
    expect(next.inputSubcategoryId).toBe(600);
    expect(next.serviceAreaId).toBe(10);
  });

  it("resets subcategory and service area when category changes", () => {
    const current = buildFilterContextFixture({
      inputCategoryId: 515,
      inputSubcategoryId: 600,
      serviceAreaId: 10,
    });

    const next = applyFilterCascade(current, "inputCategoryId", 900);

    expect(next.inputCategoryId).toBe(900);
    expect(next.inputSubcategoryId).toBeNull();
    expect(next.serviceAreaId).toBeNull();
  });
});
