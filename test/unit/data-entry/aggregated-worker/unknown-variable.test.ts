import { describe, expect, it } from "vitest";

import { classifyDependencies } from "@/app/data-entry/enter-data/services/aggregated-worker/dependency-classifier";

describe("unknown variable classification", () => {
  it("marks absent variables as unknown-variable", () => {
    const result = classifyDependencies(["A", "B"], { A: "10" });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("unknown-variable");
  });
});
