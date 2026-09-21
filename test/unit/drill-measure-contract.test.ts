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
});
