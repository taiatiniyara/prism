import { describe, expect, it } from "vitest";

import type { FormulaInput } from "@/db/schema/dataEntry";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";
import { computeSliceLabel } from "@/app/data-entry/review-kpi/slice-label";

const allMemberInput = (): FormulaInput => ({
  measure_def_id: 1,
  variable_name: "x",
  provider_id: ALL_MEMBER.provider_id,
  category_id: ALL_MEMBER.category_id,
  technology_id: ALL_MEMBER.technology_id,
  asset_class_id: ALL_MEMBER.asset_class_id,
  customer_type_id: ALL_MEMBER.customer_type_id,
  payment_mode_id: ALL_MEMBER.payment_mode_id,
  consumption_band_id: ALL_MEMBER.consumption_band_id,
  division_id: ALL_MEMBER.division_id,
  gender_id: ALL_MEMBER.gender_id,
  utility_function_id: ALL_MEMBER.utility_function_id,
});

describe("computeSliceLabel", () => {
  it("returns null when every dimension is the All-member (no slice — just the measure)", () => {
    expect(computeSliceLabel(allMemberInput(), new Map())).toBeNull();
  });

  it("labels a single pinned dimension by its resolved managed_list_items name", () => {
    const input = { ...allMemberInput(), division_id: 1012 };
    const names = new Map([[1012, "Executive"]]);
    expect(computeSliceLabel(input, names)).toBe("Executive");
  });

  it("joins multiple pinned dimensions, in DIMENSIONS' canonical order", () => {
    // division_id precedes gender_id in the canonical DIMENSIONS order.
    const input = { ...allMemberInput(), gender_id: 931, division_id: 1012 };
    const names = new Map([
      [1012, "Executive"],
      [931, "Female"],
    ]);
    expect(computeSliceLabel(input, names)).toBe("Executive • Female");
  });

  it("skips a pinned member with no resolved name, rather than showing a raw id", () => {
    const input = { ...allMemberInput(), division_id: 999999 };
    expect(computeSliceLabel(input, new Map())).toBeNull();
  });

  it("this is the exact shape that produced the reported 'lot of repeated inputs': KPI 62-style per-division binding", () => {
    const input = { ...allMemberInput(), division_id: 1014, gender_id: 931 };
    const names = new Map([
      [1014, "Finance"],
      [931, "Female"],
    ]);
    expect(computeSliceLabel(input, names)).toBe("Finance • Female");
  });
});