import { describe, expect, it } from "vitest";
import {
  ALL_MEMBER,
  buildDimensionMembers,
} from "@/lib/data-entry/dimensions";

/**
 * ALL_MEMBER is now derived from the central dimension map
 * (lib/dimensions/dimension-map.ts). These pins guard against a silent change
 * to any canonical "All" member id — every data_entries write depends on them.
 */
const EXPECTED_ALL_MEMBER = {
  provider_id: 20,
  category_id: 30,
  technology_id: 40,
  asset_class_id: 983,
  customer_type_id: 690,
  payment_mode_id: 720,
  consumption_band_id: 1005,
  division_id: 1011,
  gender_id: 1022,
  utility_function_id: 1023,
} as const;

describe("ALL_MEMBER (derived from the central dimension map)", () => {
  it("holds exactly the ten canonical All-member ids, unchanged", () => {
    expect(ALL_MEMBER).toEqual(EXPECTED_ALL_MEMBER);
    expect(Object.keys(ALL_MEMBER).sort()).toEqual(
      Object.keys(EXPECTED_ALL_MEMBER).sort(),
    );
  });
});

describe("buildDimensionMembers", () => {
  it("fills every dimension with its All member for an empty slice", () => {
    expect(buildDimensionMembers()).toEqual(EXPECTED_ALL_MEMBER);
    expect(buildDimensionMembers({})).toEqual(EXPECTED_ALL_MEMBER);
  });

  it("keeps a sliced value and fills the rest with All", () => {
    const row = buildDimensionMembers({ technology_id: 46 });
    expect(row.technology_id).toBe(46);
    expect(row.provider_id).toBe(ALL_MEMBER.provider_id);
    expect(row.gender_id).toBe(ALL_MEMBER.gender_id);
  });

  it("treats 0 / null / undefined as 'not sliced' (falls back to All)", () => {
    expect(buildDimensionMembers({ technology_id: 0 }).technology_id).toBe(
      ALL_MEMBER.technology_id,
    );
    expect(buildDimensionMembers({ technology_id: null }).technology_id).toBe(
      ALL_MEMBER.technology_id,
    );
    expect(
      buildDimensionMembers({ technology_id: undefined }).technology_id,
    ).toBe(ALL_MEMBER.technology_id);
  });
});
