import { describe, expect, it } from "vitest";

import {
  getNextAttemptStatus,
  mapFailureMessage,
} from "@/app/data-entry/kpi-worker/status.service";

describe("kpi worker status lifecycle", () => {
  it("keeps transient failures pending while retries remain", () => {
    expect(
      getNextAttemptStatus({
        currentStatus: "processing",
        hasFailure: true,
        transientFailure: true,
        retryCount: 1,
        maxRetries: 3,
      }),
    ).toBe("pending");
  });

  it("marks attempt as failed when retries are exhausted", () => {
    expect(
      getNextAttemptStatus({
        currentStatus: "processing",
        hasFailure: true,
        transientFailure: true,
        retryCount: 3,
        maxRetries: 3,
      }),
    ).toBe("failed");
  });

  it("maps readable failure reason text", () => {
    expect(mapFailureMessage("failed", "Missing required input A")).toBe(
      "Missing required input A",
    );
    expect(mapFailureMessage("failed", null)).toContain("Calculation failed");
  });
});
