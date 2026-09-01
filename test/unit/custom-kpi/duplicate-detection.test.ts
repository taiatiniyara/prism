import { describe, expect, it } from "vitest";

import { buildCustomKpiDefinitionFingerprint } from "@/app/settings/kpi/custom-kpi/service";

describe("buildCustomKpiDefinitionFingerprint", () => {
  it("normalizes case and whitespace", () => {
    const a = buildCustomKpiDefinitionFingerprint({
      title: "  Total Energy  Use ",
      formulaExpression: " inputA  /   inputB ",
      unitId: 91,
    });

    const b = buildCustomKpiDefinitionFingerprint({
      title: "total energy use",
      formulaExpression: "inputa / inputb",
      unitId: 91,
    });

    expect(a).toBe(b);
  });

  it("changes when any key field differs", () => {
    const base = buildCustomKpiDefinitionFingerprint({
      title: "Total Energy Use",
      formulaExpression: "inputA / inputB",
      unitId: 91,
    });

    const changedFormula = buildCustomKpiDefinitionFingerprint({
      title: "Total Energy Use",
      formulaExpression: "inputA - inputB",
      unitId: 91,
    });

    expect(changedFormula).not.toBe(base);
  });
});
