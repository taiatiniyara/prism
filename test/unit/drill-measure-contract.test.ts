import { describe, expect, it } from "vitest";
import {
  pickInputValue,
  type RollupCandidate,
} from "@/app/data-entry/kpi-worker/dimension-rollup";
import { buildDimensionMembers, ALL_MEMBER } from "@/lib/data-entry/dimensions";
import { dimensionByScopeKey } from "@/lib/dimensions/dimension-map";
import { sumDrillNumericValues } from "@/lib/ai/data-service/drill";
import type { FormulaInput } from "@/db/schema/dataEntry";

// Lockstep contract (spec §5.5): drill_measure's additive rollup must equal the
// calculator engine's rollup (pickInputValue) for the same address, so the two
// can never silently drift. Pure tier — no DB, deterministic CI gate: feed the
// SAME candidate rows to both. Co-owned with #3 (calculator), who tightens the
// All-member-aggregate and non-additive edge cases on top of this skeleton.

const MEASURE = 321;
const SOURCE_FIELD = dimensionByScopeKey("source")!.field; // → technology_id
const DIESEL = 901;
const SOLAR = 902;

// A utility-grain fact row split only on `source` (technology_id); every other
// dimension carries its canonical All member, matching how drill and the engine
// both read the fact grain.
const row = (
  sourceId: number,
  value: string | null,
  flags: { isDeleted?: boolean; isRelevant?: boolean } = {},
): RollupCandidate => ({
  value,
  isDeleted: flags.isDeleted ?? false,
  isRelevant: flags.isRelevant ?? true,
  energyProviderId: ALL_MEMBER.provider_id,
  energyTypeId: ALL_MEMBER.category_id,
  energySourceId: sourceId,
  unitTypeId: ALL_MEMBER.asset_class_id,
  customerTypeId: ALL_MEMBER.customer_type_id,
  paymentModeId: ALL_MEMBER.payment_mode_id,
  consumptionBandId: ALL_MEMBER.consumption_band_id,
  divisionId: ALL_MEMBER.division_id,
  genderId: ALL_MEMBER.gender_id,
  utilityFunctionId: ALL_MEMBER.utility_function_id,
  grainAreaId: null,
  grainStationId: null,
  grainUnitId: null,
});

const baseBinding = (): FormulaInput => ({
  measure_def_id: MEASURE,
  variable_name: "x",
  ...buildDimensionMembers(),
});

describe("drill_measure ⋈ calculator rollup — lockstep contract (pure)", () => {
  // Detail slices only (no authoritative All-member aggregate row), plus a blank
  // shell that is a gap (contributes nothing, never 0).
  const rows: RollupCandidate[] = [
    row(DIESEL, "100"),
    row(SOLAR, "50"),
    row(DIESEL, null),
  ];

  it("utility total (All on every dim): drill additive sum == engine rollup", () => {
    const engine = pickInputValue({
      candidateRows: rows,
      binding: baseBinding(),
      scope: {},
      grainRollup: true,
      isAdditive: true,
    });
    const drill = sumDrillNumericValues(rows.map((r) => r.value));
    expect(drill).toBe(engine); // the contract
    expect(engine).toBe(150); // documents the expected value
  });

  it("pinned member (source = Diesel): drill member sum == engine value", () => {
    const binding: FormulaInput = { ...baseBinding(), [SOURCE_FIELD]: DIESEL };
    const engine = pickInputValue({
      candidateRows: rows,
      binding,
      scope: {},
      grainRollup: true,
      isAdditive: true,
    });
    const drill = sumDrillNumericValues(
      rows.filter((r) => r.energySourceId === DIESEL).map((r) => r.value),
    );
    expect(drill).toBe(engine); // the contract
    expect(engine).toBe(100); // documents the expected value
  });

  // Rule 1 (spec §4.6): when an authoritative All-member aggregate row exists,
  // the engine USES it and never adds the detail slices on top. drill must match
  // by reading only the aggregate — summing aggregate + slices would double-count.
  it("rule 1 — an authoritative All-member aggregate wins over its detail slices", () => {
    const withAggregate: RollupCandidate[] = [
      row(ALL_MEMBER.technology_id, "200"), // the "All source" aggregate row
      row(DIESEL, "100"),
      row(SOLAR, "50"),
    ];
    const engine = pickInputValue({
      candidateRows: withAggregate,
      binding: baseBinding(), // All on every dim (utility total)
      scope: {},
      grainRollup: true,
      isAdditive: true,
    });
    // The aggregate (200) wins — NOT the 150 Σ of slices, and NOT 350 (agg+slices).
    expect(engine).toBe(200);
    // To match, drill must select the authoritative aggregate row alone.
    const drill = sumDrillNumericValues(
      withAggregate
        .filter((r) => r.energySourceId === ALL_MEMBER.technology_id)
        .map((r) => r.value),
    );
    expect(drill).toBe(engine); // the contract
  });

  // Non-additive (spec §4.6, #4): with no authoritative aggregate, the engine
  // must NOT Σ the detail slices — it resolves as missing. So the SAME slices
  // that total 150 when additive resolve to null when the measure is not
  // additive; drill mirrors this by emitting no grand total (is_additive gate).
  it("non-additive — no aggregate ⇒ engine is missing, never Σ of slices", () => {
    const slices: RollupCandidate[] = [row(DIESEL, "100"), row(SOLAR, "50")];
    const missing = pickInputValue({
      candidateRows: slices,
      binding: baseBinding(),
      scope: {},
      grainRollup: true,
      isAdditive: false,
    });
    expect(missing).toBeNull();
    // contrast: the identical slices DO sum to 150 when the measure is additive.
    const additive = pickInputValue({
      candidateRows: slices,
      binding: baseBinding(),
      scope: {},
      grainRollup: true,
      isAdditive: true,
    });
    expect(additive).toBe(150);
  });
});
