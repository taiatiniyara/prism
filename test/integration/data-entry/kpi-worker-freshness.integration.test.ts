import { describe, expect, it } from "vitest";

import {
  consumeDeferredFollowUp,
  markDeferredFollowUp,
} from "@/app/data-entry/kpi-worker/lock";

describe("kpi worker freshness timing", () => {
  it("keeps corrected-input follow-up readiness under five minutes target", () => {
    const scope = {
      reportPeriodId: 5,
      serviceAreaId: 2,
    };

    const start = Date.now();
    markDeferredFollowUp(scope);
    const ready = consumeDeferredFollowUp(scope);
    const elapsedMs = Date.now() - start;

    expect(ready).toBe(true);
    expect(elapsedMs).toBeLessThanOrEqual(300_000);
  });
});
