import { describe, expect, it } from "vitest";

import type { FormulaInput } from "@/db/schema/dataEntry";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";
import {
  matchDimension,
  pickInputValue,
  rankGrainLevel,
  selectGrainCandidates,
  strataShouldRollup,
  sumRollupValues,
  type RollupCandidate,
} from "@/app/data-entry/kpi-worker/dimension-rollup";

const candidate = (over: Partial<RollupCandidate> = {}): RollupCandidate => ({
  value: "1",
  isDeleted: false,
  isRelevant: true,
  energyProviderId: null,
  energyTypeId: null,
  energySourceId: null,
  unitTypeId: null,
  customerTypeId: null,
  paymentModeId: null,
  consumptionBandId: null,
  divisionId: null,
  genderId: null,
  utilityFunctionId: null,
  grainAreaId: null,
  grainStationId: null,
  grainUnitId: null,
  ...over,
});

const allMemberBinding = (): FormulaInput => ({
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

describe("matchDimension", () => {
  const ALL = ALL_MEMBER.provider_id;

  it("pins to an exact member when bound to a leaf", () => {
    expect(matchDimension(5, 5, null, ALL)).toBe(true);
    expect(matchDimension(6, 5, null, ALL)).toBe(false);
  });

  it("an All-binding matches the All-member row and legacy NULL", () => {
    expect(matchDimension(ALL, ALL, null, ALL)).toBe(true);
    expect(matchDimension(null, ALL, null, ALL)).toBe(true);
    expect(matchDimension(7, ALL, null, ALL)).toBe(false);
  });

  it("unbound falls back to the evaluation scope value (or All / null)", () => {
    expect(matchDimension(9, null, 9, ALL)).toBe(true);
    expect(matchDimension(ALL, null, 9, ALL)).toBe(true);
    expect(matchDimension(null, null, 9, ALL)).toBe(true);
    expect(matchDimension(10, null, 9, ALL)).toBe(false);
  });

  it("unbound with no scope matches only the All-member / null", () => {
    expect(matchDimension(ALL, null, null, ALL)).toBe(true);
    expect(matchDimension(null, null, null, ALL)).toBe(true);
    expect(matchDimension(3, null, null, ALL)).toBe(false);
  });
});

describe("sumRollupValues", () => {
  it("sums numeric values, skipping deleted / irrelevant / non-numeric", () => {
    const result = sumRollupValues([
      candidate({ value: "10" }),
      candidate({ value: "5.5" }),
      candidate({ value: "3", isDeleted: true }),
      candidate({ value: "4", isRelevant: false }),
      candidate({ value: "not-a-number" }),
    ]);
    expect(result).toEqual({ sum: 15.5, hasValue: true });
  });

  it("reports hasValue=false when nothing contributes", () => {
    expect(sumRollupValues([candidate({ value: null })])).toEqual({
      sum: 0,
      hasValue: false,
    });
  });
});

describe("strataShouldRollup", () => {
  it("fires only when the KPI level is coarser than the input level", () => {
    expect(strataShouldRollup(3, 1)).toBe(true);
    expect(strataShouldRollup(1, 3)).toBe(false);
    expect(strataShouldRollup(2, 2)).toBe(false);
    expect(strataShouldRollup(null, 1)).toBe(false);
    expect(strataShouldRollup(3, null)).toBe(false);
  });
});

describe("rankGrainLevel", () => {
  it("ranks unit > station > area > utility-aggregate", () => {
    expect(rankGrainLevel(candidate({ grainUnitId: 1 }))).toBe(3);
    expect(rankGrainLevel(candidate({ grainStationId: 1 }))).toBe(2);
    expect(rankGrainLevel(candidate({ grainAreaId: 1 }))).toBe(1);
    expect(rankGrainLevel(candidate())).toBe(0);
  });
});

describe("selectGrainCandidates", () => {
  it("returns rows unchanged when not rolling up grain", () => {
    const rows = [candidate({ grainUnitId: 1 }), candidate({ grainAreaId: 2 })];
    expect(selectGrainCandidates(rows, false)).toEqual({
      candidates: rows,
      summed: false,
      mixedLevels: [],
    });
  });

  it("prefers the authoritative utility-level aggregate, never adds finer on top", () => {
    const agg = candidate({ value: "100" });
    const unit = candidate({ value: "40", grainUnitId: 7 });
    const result = selectGrainCandidates([agg, unit], true);
    expect(result.candidates).toEqual([agg]);
    expect(result.summed).toBe(false);
  });

  it("sums the coarsest single level present below target", () => {
    const a1 = candidate({ value: "30", grainAreaId: 1 });
    const a2 = candidate({ value: "20", grainAreaId: 2 });
    const result = selectGrainCandidates([a1, a2], true);
    expect(result.candidates).toEqual([a1, a2]);
    expect(result.summed).toBe(true);
    expect(result.mixedLevels).toEqual([]);
  });

  it("flags mixed sub-utility levels and rolls up the coarsest only", () => {
    const area = candidate({ value: "30", grainAreaId: 1 });
    const unit = candidate({ value: "10", grainUnitId: 9 });
    const result = selectGrainCandidates([area, unit], true);
    expect(result.candidates).toEqual([area]); // rank 1 (coarsest > 0)
    expect(result.summed).toBe(true);
    expect(result.mixedLevels).toEqual([1, 3]);
  });
});

describe("pickInputValue — rule 1 / 2 / 3", () => {
  const scope = {};

  it("rule 1: uses the authoritative All-member aggregate (single value, no rollup)", () => {
    const rows = [
      candidate({ value: "500" }), // All-member row
      candidate({ value: "999", energyProviderId: 3 }), // a member slice
    ];
    expect(
      pickInputValue({
        candidateRows: rows,
        binding: allMemberBinding(),
        scope,
        grainRollup: false,
      }),
    ).toBe(500);
  });

  it("rule 1 with rollup: sums the aggregate rows", () => {
    const rows = [candidate({ value: "300" }), candidate({ value: "200" })];
    expect(
      pickInputValue({
        candidateRows: rows,
        binding: allMemberBinding(),
        scope,
        grainRollup: true,
      }),
    ).toBe(500);
  });

  it("rule 2: no aggregate → sums the member slices (dimension rollup)", () => {
    const rows = [
      candidate({ value: "90", energyProviderId: 3 }),
      candidate({ value: "410", energyProviderId: 4 }),
    ];
    expect(
      pickInputValue({
        candidateRows: rows,
        binding: allMemberBinding(),
        scope,
        grainRollup: false,
      }),
    ).toBe(500);
  });

  it("never adds the breakdown on top of an aggregate", () => {
    const rows = [
      candidate({ value: "500" }), // aggregate
      candidate({ value: "90", energyProviderId: 3 }),
      candidate({ value: "410", energyProviderId: 4 }),
    ];
    expect(
      pickInputValue({
        candidateRows: rows,
        binding: allMemberBinding(),
        scope,
        grainRollup: false,
      }),
    ).toBe(500);
  });

  it("rule 3: nothing matches → null", () => {
    const rows = [candidate({ value: "1", energyProviderId: 3 })];
    const pinned = { ...allMemberBinding(), provider_id: 99 };
    expect(
      pickInputValue({
        candidateRows: rows,
        binding: pinned,
        scope,
        grainRollup: false,
      }),
    ).toBeNull();
  });
});
