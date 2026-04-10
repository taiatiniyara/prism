import { describe, expect, it } from "vitest";

import { buildCustomKpiDefinitionFingerprint } from "@/app/settings/kpi/custom-kpi/service";

describe("buildCustomKpiDefinitionFingerprint", () => {
  it("normalizes case and whitespace", () => {
    const a = buildCustomKpiDefinitionFingerprint({
      title: "  Total Energy  Use ",
      formulaExpression: " inputA  /   inputB ",
      businessContext: "  Utility Monthly  ",
    });

    const b = buildCustomKpiDefinitionFingerprint({
      title: "total energy use",
      formulaExpression: "inputa / inputb",
      businessContext: "utility monthly",
    });

    expect(a).toBe(b);
  });

  it("changes when any key field differs", () => {
    const base = buildCustomKpiDefinitionFingerprint({
      title: "Total Energy Use",
      formulaExpression: "inputA / inputB",
      businessContext: "Utility Monthly",
    });

    const changedFormula = buildCustomKpiDefinitionFingerprint({
      title: "Total Energy Use",
      formulaExpression: "inputA - inputB",
      businessContext: "Utility Monthly",
    });

    expect(changedFormula).not.toBe(base);
  });
});
