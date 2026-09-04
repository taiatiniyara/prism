import { describe, expect, it } from "vitest";

import {
  carryForwardContextValues,
  type CountryContextRow,
} from "@/app/data-entry/kpi-worker/country-context-reader";

const row = (
  measureId: number,
  sourceDate: string,
  value: string | null,
  noDataReason: string | null = null,
): CountryContextRow => ({
  measureId,
  sourceDate: new Date(sourceDate),
  value,
  noDataReason,
});

const REPORT_DATE = new Date("2024-06-30");

describe("carryForwardContextValues", () => {
  it("takes the latest source_date at or before the report date, per metric", () => {
    const result = carryForwardContextValues(
      [
        row(1, "2022-01-01", "100"),
        row(1, "2023-01-01", "120"),
        row(1, "2025-01-01", "999"), // after the report date — ignored
        row(2, "2024-06-30", "5"), // exactly the report date — applies
      ],
      REPORT_DATE,
    );
    expect(result.get(1)).toBe(120);
    expect(result.get(2)).toBe(5);
  });

  it("resolves a no-data row to null (never a number)", () => {
    const result = carryForwardContextValues(
      [row(3, "2024-01-01", null, "not_available")],
      REPORT_DATE,
    );
    expect(result.has(3)).toBe(true);
    expect(result.get(3)).toBeNull();
  });

  it("resolves a non-numeric value to null", () => {
    const result = carryForwardContextValues(
      [row(4, "2024-01-01", "n/a")],
      REPORT_DATE,
    );
    expect(result.get(4)).toBeNull();
  });

  it("omits a metric whose only figures are after the report date", () => {
    const result = carryForwardContextValues(
      [row(5, "2025-01-01", "1")],
      REPORT_DATE,
    );
    expect(result.has(5)).toBe(false);
  });
});
