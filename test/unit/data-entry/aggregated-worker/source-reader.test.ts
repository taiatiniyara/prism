import { describe, expect, it } from "vitest";

import {
  resolveAggregateValue,
  type DimensionedRow,
} from "@/app/data-entry/enter-data/services/aggregated-worker/source-reader";

// All-member ids (mirror lib/data-entry/dimensions ALL_MEMBER).
const ALL = {
  provider: 20,
  category: 30,
  technology: 40,
  assetClass: 983,
  customerType: 690,
  paymentMode: 720,
  consumptionBand: 1005,
  division: 1011,
  gender: 1022,
  utilityFunction: 1023,
};

const row = (value: string | null, overrides: Partial<DimensionedRow> = {}): DimensionedRow => ({
  value,
  provider: ALL.provider,
  category: ALL.category,
  technology: ALL.technology,
  assetClass: ALL.assetClass,
  customerType: ALL.customerType,
  paymentMode: ALL.paymentMode,
  consumptionBand: ALL.consumptionBand,
  division: ALL.division,
  gender: ALL.gender,
  utilityFunction: ALL.utilityFunction,
  ...overrides,
});

describe("resolveAggregateValue — All-row else sum of detail", () => {
  it("rule 1: uses the authoritative All-member row when present", () => {
    const rows = [
      row("1000"), // fully All
      row("400", { utilityFunction: 1024 }), // a slice — must be ignored
      row("600", { utilityFunction: 1025 }),
    ];
    expect(resolveAggregateValue(rows)).toBe("1000");
  });

  it("rule 1: a legacy all-null row counts as the aggregate", () => {
    const nullRow = row("1000", {
      provider: null,
      category: null,
      technology: null,
      assetClass: null,
      customerType: null,
      paymentMode: null,
      consumptionBand: null,
      division: null,
      gender: null,
      utilityFunction: null,
    });
    expect(resolveAggregateValue([nullRow, row("5", { utilityFunction: 1024 })])).toBe("1000");
  });

  it("rule 2: sums the member slices when no aggregate row exists", () => {
    const rows = [
      row("262025", { assetClass: 983, utilityFunction: 1025 }),
      row("356579", { assetClass: 984, utilityFunction: 1024 }),
    ];
    // matches the live electricity_staff @ period 167 case
    expect(resolveAggregateValue(rows)).toBe("618604");
  });

  it("rule 2: ignores blank/non-numeric rows in the sum", () => {
    const rows = [
      row("100", { utilityFunction: 1024 }),
      row(null, { utilityFunction: 1025 }),
      row("abc", { utilityFunction: 1026 }),
      row("50", { utilityFunction: 1027 }),
    ];
    expect(resolveAggregateValue(rows)).toBe("150");
  });

  it("rule 3: missing when no row carries a number", () => {
    expect(resolveAggregateValue([])).toBeNull();
    expect(resolveAggregateValue([row(null, { utilityFunction: 1024 })])).toBeNull();
  });
});
