import { describe, expect, it } from "vitest";

import {
  acquireScopeLock,
  consumeDeferredFollowUp,
  markDeferredFollowUp,
  releaseScopeLock,
} from "@/app/data-entry/kpi-worker/lock";

describe("kpi worker in-flight suppression", () => {
  it("suppresses duplicate scope execution and keeps a deferred follow-up marker", () => {
    const scope = {
      reportPeriodId: 1,
      organizationId: 2,
      serviceAreaId: 3,
      energyResourceId: 4,
    };

    expect(acquireScopeLock(scope)).toBe(true);
    expect(acquireScopeLock(scope)).toBe(false);

    markDeferredFollowUp(scope);
    releaseScopeLock(scope);

    expect(consumeDeferredFollowUp(scope)).toBe(true);
    expect(consumeDeferredFollowUp(scope)).toBe(false);
  });
});
