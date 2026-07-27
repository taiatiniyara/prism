import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/connection", () => {
  let locked = false;
  return {
    db: {
      execute: vi.fn(async () => {
        const acquired = !locked;
        if (acquired) locked = true;
        return { rows: [{ acquired }] };
      }),
    },
  };
});

import {
  acquireScopeLock,
  consumeDeferredFollowUp,
  markDeferredFollowUp,
  releaseScopeLock,
} from "@/app/data-entry/kpi-worker/lock";

describe("kpi worker in-flight suppression", () => {
  it("suppresses duplicate scope execution and keeps a deferred follow-up marker", async () => {
    const scope = {
      reportPeriodId: 1,
      organizationId: 2,
      serviceAreaId: 3,
      energyResourceId: 4,
    };

    expect(await acquireScopeLock(scope)).toBe(true);
    expect(await acquireScopeLock(scope)).toBe(false);

    markDeferredFollowUp(scope);
    await releaseScopeLock(scope);

    expect(consumeDeferredFollowUp(scope)).toBe(true);
    expect(consumeDeferredFollowUp(scope)).toBe(false);
  });
});
