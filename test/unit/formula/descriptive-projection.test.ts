import { describe, expect, it } from "vitest";

import {
  isCategoricalDataType,
  isDescriptiveProjection,
} from "@/lib/formula/descriptive-projection";

describe("isCategoricalDataType", () => {
  it("treats option/text/boolean as categorical", () => {
    for (const t of ["option", "text", "boolean", "Option", " TEXT "]) {
      expect(isCategoricalDataType(t)).toBe(true);
    }
  });

  it("treats numeric (and unknown/blank) as not categorical", () => {
    for (const t of ["numeric", "Numeric", "date", null, undefined, ""]) {
      expect(isCategoricalDataType(t)).toBe(false);
    }
  });
});

describe("isDescriptiveProjection", () => {
  it("no binding ⇒ projection by reference", () => {
    expect(isDescriptiveProjection([])).toBe(true);
  });

  it("any categorical input ⇒ descriptive", () => {
    expect(isDescriptiveProjection(["numeric", "option"])).toBe(true);
    expect(isDescriptiveProjection(["boolean"])).toBe(true);
  });

  it("all-numeric inputs ⇒ not descriptive (numerically computable)", () => {
    expect(isDescriptiveProjection(["numeric", "numeric"])).toBe(false);
  });
});
