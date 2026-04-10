import { describe, expect, it } from "vitest";

import {
  assertCustomKpiRequestCreateAccess,
  buildCustomKpiDefinitionFingerprint,
} from "@/app/settings/kpi/custom-kpi/service";

describe("custom KPI submit request service", () => {
  it("throws when submitter user id is missing", () => {
    expect(() => assertCustomKpiRequestCreateAccess(null)).toThrow(
      "FORBIDDEN:You are not allowed to create custom KPI requests.",
    );
  });

  it("builds deterministic definition fingerprint for equivalent values", () => {
    const a = buildCustomKpiDefinitionFingerprint({
      title: "  Total Energy Use",
      formulaExpression: "inputA / inputB ",
      businessContext: " Utility Monthly ",
    });

    const b = buildCustomKpiDefinitionFingerprint({
      title: "total energy use",
      formulaExpression: "inputa / inputb",
      businessContext: "utility monthly",
    });

    expect(a).toBe(b);
  });
});
