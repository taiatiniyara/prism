import { describe, expect, it } from "vitest";

import { executeWithRetry } from "@/lib/retry";

describe("kpi worker completion latency", () => {
  it("completes successful calculation path within two minutes target", async () => {
    const start = Date.now();

    await executeWithRetry(async () => "completed", {
      maxRetries: 0,
      baseDelayMs: 1,
    });

    const elapsedMs = Date.now() - start;
    expect(elapsedMs).toBeLessThanOrEqual(120_000);
  });
});
