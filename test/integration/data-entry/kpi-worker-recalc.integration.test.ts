import { describe, expect, it } from "vitest";

import {
  consumeDeferredFollowUp,
  markDeferredFollowUp,
} from "@/app/data-entry/kpi-worker/lock";

describe("kpi worker corrected-input recalculation", () => {
  it("retains one deferred follow-up marker so latest recalculation can run", () => {
    const scope = {
      reportPeriodId: 22,
      serviceAreaId: 5,
      energyResourceId: null,
    };

    markDeferredFollowUp(scope);
    markDeferredFollowUp(scope);

    expect(consumeDeferredFollowUp(scope)).toBe(true);
    expect(consumeDeferredFollowUp(scope)).toBe(false);
  });
});
