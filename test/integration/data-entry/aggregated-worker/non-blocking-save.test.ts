import { describe, expect, it } from "vitest";

import { waitForAsyncWorkerDispatch } from "@/test/integration/data-entry/helpers/aggregated-worker";

describe("non-blocking save behavior", () => {
  it("keeps async worker dispatch detached from immediate call stack", async () => {
    let completed = false;

    const run = waitForAsyncWorkerDispatch().then(() => {
      completed = true;
    });

    expect(completed).toBe(false);
    await run;
    expect(completed).toBe(true);
  });
});
