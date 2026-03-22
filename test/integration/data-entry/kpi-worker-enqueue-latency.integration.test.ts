import { describe, expect, it } from "vitest";

import { waitForKpiWorkerDispatch } from "@/test/integration/data-entry/helpers/kpi-worker";

describe("kpi worker enqueue latency", () => {
  it("enqueues dispatch within 30 seconds target", async () => {
    const start = Date.now();
    await waitForKpiWorkerDispatch();
    const elapsedMs = Date.now() - start;

    expect(elapsedMs).toBeLessThanOrEqual(30_000);
  });
});
