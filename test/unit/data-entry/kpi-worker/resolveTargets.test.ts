import { describe, expect, it } from "vitest";

import { filterAffectedKpiTargets } from "@/app/data-entry/kpi-worker/resolveTargets";

describe("resolveAffectedKpiTargets", () => {
  it("selects active KPI definitions mapped to the triggering input", () => {
    const resolved = filterAffectedKpiTargets(
      [
        {
          id: 10,
          agg_level_id: 3,
          is_active: true,
          formula: "A + B",
          formula_inputs: [
            { input_def_id: 100, variable_name: "A" },
            { input_def_id: 200, variable_name: "B" },
          ],
        },
        {
          id: 11,
          agg_level_id: 2,
          is_active: false,
          formula: "A * 2",
          formula_inputs: [{ input_def_id: 100, variable_name: "A" }],
        },
        {
          id: 12,
          agg_level_id: 1,
          is_active: true,
          formula: null,
          formula_inputs: [{ input_def_id: 100, variable_name: "A" }],
        },
      ],
      100,
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].kpiDefId).toBe(10);
    expect(resolved[0].formulaInputs).toEqual([
      { input_def_id: 100, variable_name: "A" },
      { input_def_id: 200, variable_name: "B" },
    ]);
    expect(resolved[0].formulaVersion.length).toBeGreaterThan(10);
  });
});
