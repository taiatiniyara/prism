import { describe, expect, it } from "vitest";

import { sumRollupValues } from "@/app/data-entry/kpi-worker/resolveInputs";

describe("kpi roll-up inclusion filters", () => {
  it("includes only rows where is_deleted=false and is_relevant=true", () => {
    const result = sumRollupValues([
      { value: "12", isDeleted: false, isRelevant: true },
      { value: "5", isDeleted: true, isRelevant: true },
      { value: "9", isDeleted: false, isRelevant: false },
    ]);

    expect(result.hasValue).toBe(true);
    expect(result.sum).toBe(12);
  });
});
