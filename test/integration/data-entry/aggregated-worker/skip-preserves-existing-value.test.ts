import { describe, expect, it } from "vitest";

import { buildSkippedOutcome } from "@/app/data-entry/enter-data/services/aggregated-worker/outcome-builder";

describe("skip preserves existing value behavior", () => {
  it("produces skipped outcome without calculated value payload", () => {
    const outcome = buildSkippedOutcome("run-1", 10, "missing-value");

    expect(outcome.status).toBe("skipped");
    expect(outcome.calculatedValue).toBeUndefined();
  });
});
