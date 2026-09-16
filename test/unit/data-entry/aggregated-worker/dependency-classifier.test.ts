import { describe, expect, it } from "vitest";

import { classifyDependencies } from "@/app/data-entry/enter-data/services/aggregated-worker/dependency-classifier";

describe("classifyDependencies — optional inputs", () => {
  const formula = "a - b"; // NOT pure addition (has subtraction)

  it("fails a missing MANDATORY input in a non-additive formula", () => {
    const res = classifyDependencies(formula, ["a", "b"], { a: "10", b: "" });
    expect(res.status).toBe("skipped");
    expect(res.reason).toBe("missing-value");
  });

  it("zero-fills a missing OPTIONAL input in a non-additive formula", () => {
    const res = classifyDependencies(
      formula,
      ["a", "b"],
      { a: "10", b: "" },
      new Set(["b"]),
    );
    expect(res.status).toBe("ready");
    expect(res.variables).toEqual({ a: 10, b: 0 });
  });

  it("zero-fills an absent (unbound) OPTIONAL variable too", () => {
    const res = classifyDependencies(
      formula,
      ["a", "b"],
      { a: "10" }, // b not present at all
      new Set(["b"]),
    );
    expect(res.status).toBe("ready");
    expect(res.variables).toEqual({ a: 10, b: 0 });
  });

  it("uses an optional input's value when it IS present (not zeroed)", () => {
    const res = classifyDependencies(
      formula,
      ["a", "b"],
      { a: "10", b: "4" },
      new Set(["b"]),
    );
    expect(res.status).toBe("ready");
    expect(res.variables).toEqual({ a: 10, b: 4 });
  });

  it("still zero-fills every missing input for a pure-addition formula (unchanged)", () => {
    const res = classifyDependencies("a + b", ["a", "b"], { a: "10", b: "" });
    expect(res.status).toBe("ready");
    expect(res.variables).toEqual({ a: 10, b: 0 });
  });
});
