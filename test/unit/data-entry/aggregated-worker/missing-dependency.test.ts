import { describe, expect, it } from "vitest";

import { classifyDependencies } from "@/app/data-entry/enter-data/services/aggregated-worker/dependency-classifier";

describe("missing dependency classification", () => {
  it("marks missing values as skipped", () => {
    const result = classifyDependencies(["A", "B"], { A: "10", B: null });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("missing-value");
  });
});
