import { describe, expect, it } from "vitest";

import { waitForKpiWorkerDispatch } from "@/test/integration/data-entry/helpers/kpi-worker";

describe("kpi worker trigger", () => {
  it("dispatches asynchronously without blocking the caller", async () => {
    let completed = false;

    const dispatched = waitForKpiWorkerDispatch().then(() => {
      completed = true;
    });

    expect(completed).toBe(false);
    await dispatched;
    expect(completed).toBe(true);
  });
});
