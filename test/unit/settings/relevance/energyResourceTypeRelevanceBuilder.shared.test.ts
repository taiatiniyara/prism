import { describe, expect, it } from "vitest";

import { toPositiveInteger } from "@/app/settings/relevance/energyResourceTypeRelevanceBuilder.shared";

describe("energy resource type relevance builder helpers", () => {
  it("returns positive integers from valid numbers and numeric strings", () => {
    expect(toPositiveInteger(7)).toBe(7);
    expect(toPositiveInteger("42")).toBe(42);
    expect(toPositiveInteger(" 8 ")).toBe(8);
  });

  it("returns null for non-integer, zero, and invalid values", () => {
    expect(toPositiveInteger(0)).toBeNull();
    expect(toPositiveInteger(-1)).toBeNull();
    expect(toPositiveInteger(1.2)).toBeNull();
    expect(toPositiveInteger("abc")).toBeNull();
    expect(toPositiveInteger("")).toBeNull();
    expect(toPositiveInteger(null)).toBeNull();
  });
});
