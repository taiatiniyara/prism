import { describe, expect, it } from "vitest";

import { bindingToFormulaInput } from "@/app/data-entry/kpi-worker/formula-bindings";
import { ALL_MEMBER } from "@/lib/data-entry/dimensions";

describe("bindingToFormulaInput", () => {
  const binding = { input_measure_def_id: 42, variable_name: "gen_ipp" };

  it("carries the measure id and variable name through", () => {
    const fi = bindingToFormulaInput(binding, []);
    expect(fi.measure_def_id).toBe(42);
    expect(fi.variable_name).toBe("gen_ipp");
  });

  it("fills every dimension with its All-member when there are no rows", () => {
    const fi = bindingToFormulaInput(binding, []) as unknown as Record<
      string,
      number
    >;
    for (const [key, allMember] of Object.entries(ALL_MEMBER)) {
      expect(fi[key]).toBe(allMember);
    }
  });

  it("uses a pinned member id", () => {
    const fi = bindingToFormulaInput(binding, [
      { dimension_key: "technology_id", member_id: 777 },
    ]) as unknown as Record<string, number>;
    expect(fi.technology_id).toBe(777);
    // untouched dims still All
    expect(fi.provider_id).toBe(ALL_MEMBER.provider_id);
  });

  it("compiles Inherit (null member_id) to the All-member", () => {
    const fi = bindingToFormulaInput(binding, [
      { dimension_key: "customer_type_id", member_id: null },
    ]) as unknown as Record<string, number>;
    expect(fi.customer_type_id).toBe(ALL_MEMBER.customer_type_id);
  });

  it("keeps an explicit All-member pin as-is", () => {
    const fi = bindingToFormulaInput(binding, [
      { dimension_key: "gender_id", member_id: ALL_MEMBER.gender_id },
    ]) as unknown as Record<string, number>;
    expect(fi.gender_id).toBe(ALL_MEMBER.gender_id);
  });
});
