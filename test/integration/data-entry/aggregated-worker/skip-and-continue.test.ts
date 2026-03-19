import { describe, expect, it } from "vitest";

import { classifyDependencies } from "@/app/data-entry/enter-data/services/aggregated-worker/dependency-classifier";
import { evaluateFormula } from "@/app/data-entry/enter-data/services/aggregated-worker/evaluator";

describe("skip and continue behavior", () => {
  it("skips missing dependency target and still evaluates ready target", () => {
    const skipped = classifyDependencies(["A", "B"], { A: "10", B: null });
    const ready = classifyDependencies(["X", "Y"], { X: "4", Y: "6" });

    expect(skipped.status).toBe("skipped");
    expect(skipped.reason).toBe("missing-value");

    expect(ready.status).toBe("ready");
    const evaluated = evaluateFormula("X + Y", ready.variables);
    expect(evaluated.status).toBe("calculated");
    expect(evaluated.value).toBe("10");
  });
});
