import { describe, it, expect } from "vitest";
import {
  isPercentUnit,
  isRatioUnit,
  isUnitlessUnit,
  toDisplayValue,
  formatByUnit,
} from "@/lib/units/format";

/**
 * The single ×100 rule for the fraction-storage convention
 * (Eugene 2026-09-25, docs/percent-scale-cleanup.md). The load-bearing case is
 * that detection is EXACT on '%': compound units that merely contain '%'
 * ('% per unit GDP', '% per 1000 persons') are rates, never proportions, and
 * must not be scaled — the bug a naive includes('%') test would introduce.
 */
describe("unit predicates", () => {
  it("treats only the literal '%' as a proportion unit", () => {
    expect(isPercentUnit("%")).toBe(true);
    expect(isPercentUnit(" % ")).toBe(true); // whitespace-tolerant
    expect(isPercentUnit("% per unit GDP")).toBe(false);
    expect(isPercentUnit("% per 1000 persons")).toBe(false);
    expect(isPercentUnit("Ratio")).toBe(false);
    expect(isPercentUnit(null)).toBe(false);
  });

  it("recognises the Ratio unit case-insensitively", () => {
    expect(isRatioUnit("Ratio")).toBe(true);
    expect(isRatioUnit("ratio")).toBe(true);
    expect(isRatioUnit("%")).toBe(false);
  });

  it("recognises dimensionless units", () => {
    expect(isUnitlessUnit(null)).toBe(true);
    expect(isUnitlessUnit("")).toBe(true);
    expect(isUnitlessUnit("Units N/A")).toBe(true);
    expect(isUnitlessUnit("MWh")).toBe(false);
  });
});

describe("toDisplayValue", () => {
  it("scales only exact '%' fractions by 100", () => {
    expect(toDisplayValue(0.06, "%")).toBe(6);
    expect(toDisplayValue(1, "%")).toBe(100);
    expect(toDisplayValue(0.5, "% per 1000 persons")).toBe(0.5); // not scaled
    expect(toDisplayValue(0.94, "Ratio")).toBe(0.94);
    expect(toDisplayValue(57.6, "Minutes/Customer")).toBe(57.6);
  });

  it("returns null for null/NaN/Infinity", () => {
    expect(toDisplayValue(null, "%")).toBeNull();
    expect(toDisplayValue(Number.NaN, "%")).toBeNull();
    expect(toDisplayValue(Infinity, "MWh")).toBeNull();
  });
});

describe("formatByUnit", () => {
  it("presents a stored fraction as a percent", () => {
    expect(formatByUnit(0.06, "%")).toBe("6%");
    expect(formatByUnit(0.945, "%")).toBe("94.5%");
    expect(formatByUnit(1, "%")).toBe("100%");
    expect(formatByUnit(1.12, "%")).toBe("112%"); // cost recovery > 100% is real
  });

  it("does NOT scale compound '%' units", () => {
    expect(formatByUnit(0.5, "% per 1000 persons")).toBe("0.5 % per 1000 persons");
    expect(formatByUnit(2.3, "% per unit GDP")).toBe("2.3 % per unit GDP");
  });

  it("shows Ratio and unitless values bare", () => {
    expect(formatByUnit(0.94, "Ratio")).toBe("0.94");
    expect(formatByUnit(42, "Units N/A")).toBe("42");
    expect(formatByUnit(42, null)).toBe("42");
    expect(formatByUnit(42, "")).toBe("42");
  });

  it("appends any other unit with a space", () => {
    expect(formatByUnit(57.6, "Minutes/Customer")).toBe("57.6 Minutes/Customer");
    expect(formatByUnit(90, "MWh")).toBe("90 MWh");
  });

  it("rounds smartly to ≤2 decimals by default and honours forced decimals", () => {
    expect(formatByUnit(0.12345, "%")).toBe("12.35%"); // 12.345 → 12.35
    expect(formatByUnit(0.1, "%")).toBe("10%"); // trailing zeros trimmed
    expect(formatByUnit(0.06, "%", { decimals: 1 })).toBe("6.0%");
    expect(formatByUnit(90, "MWh", { decimals: 2 })).toBe("90.00 MWh");
  });

  it("returns null (or nullText) for a null/NaN value", () => {
    expect(formatByUnit(null, "%")).toBeNull();
    expect(formatByUnit(Number.NaN, "MWh")).toBeNull();
    expect(formatByUnit(null, "%", { nullText: "N/A" })).toBe("N/A");
  });
});
