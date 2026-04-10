import { describe, expect, it } from "vitest";

import {
  assertValidCustomKpiStatusTransition,
  canTransitionCustomKpiStatus,
} from "@/app/settings/kpi/custom-kpi/service";

describe("custom KPI status transitions", () => {
  it("allows initial decisions from pending status", () => {
    expect(canTransitionCustomKpiStatus("PENDING_REVIEW", "APPROVED")).toBe(
      true,
    );
    expect(canTransitionCustomKpiStatus("PENDING_REVIEW", "REJECTED")).toBe(
      true,
    );
    expect(canTransitionCustomKpiStatus("PENDING_REVIEW", "REPLACED")).toBe(
      true,
    );
  });

  it("blocks terminal-to-terminal transitions without override", () => {
    expect(canTransitionCustomKpiStatus("APPROVED", "REJECTED")).toBe(false);
    expect(() =>
      assertValidCustomKpiStatusTransition("REPLACED", "APPROVED"),
    ).toThrow("VALIDATION:Invalid custom KPI status transition");
  });

  it("allows terminal-to-terminal transitions with override", () => {
    expect(
      canTransitionCustomKpiStatus("APPROVED", "REJECTED", { override: true }),
    ).toBe(true);
  });
});
