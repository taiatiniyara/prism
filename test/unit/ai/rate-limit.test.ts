import { describe, expect, it, beforeEach } from "vitest";

import { acquireConcurrencySlot, releaseConcurrencySlot } from "@/lib/ai/rate-limit";

describe("concurrency tracking", () => {
  beforeEach(() => {
    // Fresh state by releasing any leaked slots
    releaseConcurrencySlot("test-user");
    releaseConcurrencySlot("test-user");
    releaseConcurrencySlot("test-user");
  });

  it("starts at zero concurrent requests", () => {
    acquireConcurrencySlot("test-user");
    acquireConcurrencySlot("test-user");
    // Should not throw - two concurrent is fine
  });

  it("releases slots correctly", () => {
    acquireConcurrencySlot("test-user");
    acquireConcurrencySlot("test-user");
    releaseConcurrencySlot("test-user");
    releaseConcurrencySlot("test-user");
    // Back to zero, acquiring again works
    acquireConcurrencySlot("test-user");
  });

  it("handles release with no acquire gracefully", () => {
    releaseConcurrencySlot("no-such-user");
    // Should not throw
  });
});
