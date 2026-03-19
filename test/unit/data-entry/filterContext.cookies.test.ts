import { describe, expect, it } from "vitest";

import { sanitizeFilterContext } from "@/app/data-entry/filterContext.cookies";

describe("sanitizeFilterContext", () => {
  it("converts positive integer-like values to numbers", () => {
    const result = sanitizeFilterContext({
      reportTypeId: "5",
      reportPeriodId: "10",
      inputCategoryId: 12,
      inputSubcategoryId: "13",
      serviceAreaId: "14",
    });

    expect(result).toEqual({
      reportTypeId: 5,
      reportPeriodId: 10,
      inputCategoryId: 12,
      inputSubcategoryId: 13,
      serviceAreaId: 14,
    });
  });

  it("normalizes invalid values to null", () => {
    const result = sanitizeFilterContext({
      reportTypeId: "abc",
      reportPeriodId: "-1",
      inputCategoryId: "0",
      inputSubcategoryId: null,
      serviceAreaId: undefined,
    });

    expect(result).toEqual({
      reportTypeId: null,
      reportPeriodId: null,
      inputCategoryId: null,
      inputSubcategoryId: null,
      serviceAreaId: null,
    });
  });
});
