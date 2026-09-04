import { describe, expect, it } from "vitest";

import { createFactResolver } from "@/app/data-entry/kpi-worker/fact-resolver";
import type { MeasureMeta } from "@/app/data-entry/kpi-worker/fact-source";
import type { KpiWorkerScope } from "@/app/data-entry/kpi-worker/types";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";
import type { FormulaInput } from "@/db/schema/dataEntry";
import {
  dimRow,
  InMemoryCountryContextReader,
  InMemoryFactSource,
} from "@/test/fixtures/kpi-worker/fact-source";

const scope = (over: Partial<KpiWorkerScope> = {}): KpiWorkerScope => ({
  reportPeriodId: 1,
  organizationId: 1,
  serviceAreaId: null,
  unitId: null,
  customerTypeId: null,
  paymentModeId: null,
  ...over,
});

const binding = (
  measure_def_id: number,
  variable_name: string,
  over: Partial<FormulaInput> = {},
): FormulaInput => ({
  measure_def_id,
  variable_name,
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
  ...over,
});

const meta = (
  entries: Array<[number, Partial<MeasureMeta>]>,
): Map<number, MeasureMeta> =>
  new Map(
    entries.map(([id, m]) => [
      id,
      { strataId: m.strataId ?? null, isContextFed: m.isContextFed ?? false },
    ]),
  );

const resolver = (
  facts: InMemoryFactSource,
  context = new InMemoryCountryContextReader(new Map()),
) => createFactResolver({ facts, context });

describe("fact resolver", () => {
  it("returns empty for a formula with no inputs", async () => {
    const { resolve } = resolver(new InMemoryFactSource(new Map(), []));
    await expect(
      resolve({ formulaInputs: [], kpiAggLevelId: null, scope: scope() }),
    ).resolves.toEqual({ variables: {}, missingVariables: [] });
  });

  it("resolves an All-member aggregate row to its value", async () => {
    const { resolve } = resolver(
      new InMemoryFactSource(meta([[10, {}]]), [dimRow(10, { value: "42" })]),
    );
    const out = await resolve({
      formulaInputs: [binding(10, "a")],
      kpiAggLevelId: null,
      scope: scope(),
    });
    expect(out).toEqual({ variables: { a: 42 }, missingVariables: [] });
  });

  it("dimension-rolls the member slices when no aggregate row exists", async () => {
    const { resolve } = resolver(
      new InMemoryFactSource(meta([[10, {}]]), [
        dimRow(10, { value: "90", energyProviderId: 3 }),
        dimRow(10, { value: "410", energyProviderId: 4 }),
      ]),
    );
    const out = await resolve({
      formulaInputs: [binding(10, "a")],
      kpiAggLevelId: null,
      scope: scope(),
    });
    expect(out.variables.a).toBe(500);
  });

  it("lists a variable as missing when nothing resolves", async () => {
    const { resolve } = resolver(
      new InMemoryFactSource(meta([[10, {}]]), []),
    );
    const out = await resolve({
      formulaInputs: [binding(10, "a")],
      kpiAggLevelId: null,
      scope: scope(),
    });
    expect(out).toEqual({ variables: {}, missingVariables: ["a"] });
  });

  it("grain-rolls sub-utility rows up to the utility target", async () => {
    const { resolve } = resolver(
      new InMemoryFactSource(meta([[10, {}]]), [
        dimRow(10, { value: "30", grainAreaId: 1 }),
        dimRow(10, { value: "20", grainAreaId: 2 }),
      ]),
    );
    const out = await resolve({
      formulaInputs: [binding(10, "a")],
      kpiAggLevelId: null,
      scope: scope(), // no pinned area/unit → utility target
    });
    expect(out.variables.a).toBe(50);
  });

  it("prefers the utility aggregate over the area breakdown", async () => {
    const { resolve } = resolver(
      new InMemoryFactSource(meta([[10, {}]]), [
        dimRow(10, { value: "100" }), // utility-level
        dimRow(10, { value: "30", grainAreaId: 1 }),
        dimRow(10, { value: "20", grainAreaId: 2 }),
      ]),
    );
    const out = await resolve({
      formulaInputs: [binding(10, "a")],
      kpiAggLevelId: null,
      scope: scope(),
    });
    expect(out.variables.a).toBe(100);
  });

  it("routes context-fed inputs to the CountryContextReader", async () => {
    const facts = new InMemoryFactSource(meta([[10, { isContextFed: true }]]), []);
    const context = new InMemoryCountryContextReader(new Map([[10, 7_000_000]]));
    const { resolve } = resolver(facts, context);
    const out = await resolve({
      formulaInputs: [binding(10, "population")],
      kpiAggLevelId: null,
      scope: scope(),
    });
    expect(out.variables.population).toBe(7_000_000);
  });

  it("a null context value makes the variable missing (never 0)", async () => {
    const facts = new InMemoryFactSource(meta([[10, { isContextFed: true }]]), []);
    const context = new InMemoryCountryContextReader(new Map([[10, null]]));
    const { resolve } = resolver(facts, context);
    const out = await resolve({
      formulaInputs: [binding(10, "gdp")],
      kpiAggLevelId: null,
      scope: scope(),
    });
    expect(out).toEqual({ variables: {}, missingVariables: ["gdp"] });
  });

  it("strata rollup sums when the KPI level is coarser than the input", async () => {
    const { resolve } = resolver(
      new InMemoryFactSource(meta([[10, { strataId: 1 }]]), [
        dimRow(10, { value: "4" }),
        dimRow(10, { value: "6" }),
      ]),
    );
    const out = await resolve({
      formulaInputs: [binding(10, "a")],
      kpiAggLevelId: 3,
      scope: scope(),
    });
    expect(out.variables.a).toBe(10);
  });
});
