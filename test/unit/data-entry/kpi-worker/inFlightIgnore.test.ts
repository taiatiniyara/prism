import { describe, expect, it, vi } from "vitest";

// A tiny stand-in for Postgres session advisory locks: a set of held lock ids.
vi.mock("@/db/connection", () => {
  const held = new Set<string>();
  return {
    db: {
      execute: vi.fn(async (query: { queryChunks?: unknown[] }) => {
        const text = JSON.stringify(query?.queryChunks ?? query);
        const id = text.match(/(\d{6,})/)?.[1] ?? "0";
        if (text.includes("pg_try_advisory_lock")) {
          const acquired = !held.has(id);
          if (acquired) held.add(id);
          return { rows: [{ acquired }] };
        }
        if (text.includes("pg_advisory_unlock")) {
          held.delete(id);
          return { rows: [{ unlocked: true }] };
        }
        return { rows: [] };
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

const scope = {
  reportPeriodId: 1,
  organizationId: 2,
  serviceAreaId: 3,
  unitId: 4,
};

describe("kpi worker in-flight suppression", () => {
  it("suppresses a concurrent run for the same scope", async () => {
    expect(await acquireScopeLock(scope)).toBe(true);
    expect(await acquireScopeLock(scope)).toBe(false);
    await releaseScopeLock(scope);
  });

  it("releaseScopeLock frees the scope so the next run can acquire it", async () => {
    expect(await acquireScopeLock(scope)).toBe(true);
    await releaseScopeLock(scope);
    // Would stay false before the activeLocks bookkeeping fix — the unlock
    // never ran.
    expect(await acquireScopeLock(scope)).toBe(true);
    await releaseScopeLock(scope);
  });

  it("keeps a deferred follow-up marker across a lock cycle", async () => {
    expect(await acquireScopeLock(scope)).toBe(true);
    markDeferredFollowUp(scope);
    await releaseScopeLock(scope);

    expect(consumeDeferredFollowUp(scope)).toBe(true);
    expect(consumeDeferredFollowUp(scope)).toBe(false);
  });
});
