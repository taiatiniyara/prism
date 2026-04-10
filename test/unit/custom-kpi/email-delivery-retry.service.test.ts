import { describe, expect, it } from "vitest";

import {
  calculateNextCustomKpiEmailAttemptAt,
  resolveCustomKpiEmailFailureState,
} from "@/app/settings/kpi/custom-kpi/service";

describe("custom KPI email retry state transitions", () => {
  it("marks first failed attempt as retryable", () => {
    expect(resolveCustomKpiEmailFailureState(1)).toBe("FAILED_RETRYABLE");
  });

  it("marks terminal failure at max attempts", () => {
    expect(resolveCustomKpiEmailFailureState(3)).toBe("FAILED_FINAL");
  });

  it("schedules next attempt before max and stops after max", () => {
    const start = new Date("2026-04-10T00:00:00.000Z");
    const next = calculateNextCustomKpiEmailAttemptAt(1, start);

    expect(next).toBeInstanceOf(Date);
    expect(next!.getTime()).toBeGreaterThan(start.getTime());
    expect(calculateNextCustomKpiEmailAttemptAt(3, start)).toBeNull();
  });
});
