import { describe, expect, it } from "vitest";

import { executeWithRetry } from "@/app/data-entry/kpi-worker/retry";

describe("kpi worker transient retry policy", () => {
  it("retries transient failures up to three times and then succeeds", async () => {
    let attempts = 0;

    const value = await executeWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("temporary connection timeout");
        }

        return "ok";
      },
      {
        maxRetries: 3,
        baseDelayMs: 1,
      },
    );

    expect(value).toBe("ok");
    expect(attempts).toBe(3);
  });
});
