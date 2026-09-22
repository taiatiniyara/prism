import { describe, it, expect } from "vitest";
import { isPlausible, formatValue } from "@/lib/ai/data-service/benchmark-report";

/**
 * Guards the report data-quality gate (#16's real-report failures):
 *  - a "System Losses" value of -1,040,180 must be treated as a unit/scale error
 *    so it never ranks or drags the pacific average, and
 *  - values must render WITH their unit so a bare "57.6" can't be misread.
 */
describe("benchmark report — plausibility gate", () => {
  it("accepts normal benchmark values", () => {
    expect(isPlausible(57.6, "min")).toBe(true);
    expect(isPlausible(6, "%")).toBe(true);
    expect(isPlausible(0.94, "×")).toBe(true);
    expect(isPlausible(0, "%")).toBe(true);
    expect(isPlausible(112, "%")).toBe(true); // cost recovery > 100% is real
  });

  it("rejects the #16 unit/scale-error case and other egregious values", () => {
    expect(isPlausible(-1_040_180, "%")).toBe(false);
    expect(isPlausible(-1_040_180, "min")).toBe(false); // million-magnitude, any unit
    expect(isPlausible(50_000, "%")).toBe(false); // percentage far out of band
    expect(isPlausible(Number.NaN, "%")).toBe(false);
    expect(isPlausible(Infinity, "min")).toBe(false);
  });

  it("keeps a small negative percentage (not a scale error)", () => {
    expect(isPlausible(-2, "%")).toBe(true);
  });
});

describe("benchmark report — value formatting", () => {
  it("appends the unit so no value is scaleless", () => {
    expect(formatValue(57.6, "min")).toBe("57.6 min");
    expect(formatValue(6, "%")).toBe("6%");
    expect(formatValue(0.94, "×")).toBe("0.94×");
    expect(formatValue(0.94, "x")).toBe("0.94×");
    expect(formatValue(1.5, "ratio")).toBe("1.5×");
  });

  it("handles a missing unit and integer/decimal rounding", () => {
    expect(formatValue(42, null)).toBe("42");
    expect(formatValue(42, "")).toBe("42");
    expect(formatValue(1.239, "%")).toBe("1.24%");
  });
});
