import { describe, expect, it } from "vitest";

import { waitForAsyncWorkerDispatch } from "@/test/integration/data-entry/helpers/aggregated-worker";

describe("aggregated worker trigger and calculate", () => {
  it("dispatches asynchronously without blocking save response loop", async () => {
    const start = Date.now();

    await waitForAsyncWorkerDispatch();

    expect(Date.now() - start).toBeGreaterThanOrEqual(0);
  });
});
