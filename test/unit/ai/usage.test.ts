import { describe, expect, it } from "vitest";

import { addTokenUsage, estimateCostCents, toTokenUsage } from "@/lib/ai/usage";

describe("toTokenUsage", () => {
  it("reads totals and the cache split from the SDK usage shape", () => {
    expect(
      toTokenUsage({
        inputTokens: 25536,
        outputTokens: 4,
        inputTokenDetails: { cacheReadTokens: 25201, cacheWriteTokens: 0 },
      }),
    ).toEqual({ inputTokens: 25536, outputTokens: 4, cacheReadTokens: 25201, cacheWriteTokens: 0 });
  });

  it("defaults everything to zero when usage or details are missing", () => {
    expect(toTokenUsage(undefined)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(toTokenUsage({ inputTokens: 10, outputTokens: null }).cacheReadTokens).toBe(0);
  });
});

describe("addTokenUsage", () => {
  it("sums field by field", () => {
    const a = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 };
    expect(addTokenUsage(a, a)).toEqual({
      inputTokens: 2,
      outputTokens: 4,
      cacheReadTokens: 6,
      cacheWriteTokens: 8,
    });
  });
});

describe("estimateCostCents", () => {
  const M = 1_000_000;

  it("prices uncached input and output at the base rates", () => {
    const usage = { inputTokens: M, outputTokens: M, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(estimateCostCents("claude-sonnet-4-6", usage)).toBe(300 + 1500);
  });

  it("prices cache reads at 0.1x and cache writes at 1.25x", () => {
    expect(
      estimateCostCents("claude-sonnet-4-6", {
        inputTokens: M,
        outputTokens: 0,
        cacheReadTokens: M,
        cacheWriteTokens: 0,
      }),
    ).toBe(30);
    expect(
      estimateCostCents("claude-sonnet-4-6", {
        inputTokens: M,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: M,
      }),
    ).toBe(375);
  });

  it("a cache-heavy tool loop costs far less than the uncached estimate", () => {
    // Shape of a real 4-step turn: one cold write of the ~25k prefix, then three reads.
    const usage = { inputTokens: 110_000, outputTokens: 1200, cacheReadTokens: 75_000, cacheWriteTokens: 25_000 };
    const uncachedEstimate = estimateCostCents("claude-sonnet-4-6", {
      ...usage,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(estimateCostCents("claude-sonnet-4-6", usage)).toBeLessThan(uncachedEstimate / 2);
  });

  it("uses Haiku 4.5 pricing ($1 / $5) for the mini + fallback model", () => {
    const usage = { inputTokens: M, outputTokens: M, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(estimateCostCents("claude-haiku-4-5-20251001", usage)).toBe(100 + 500);
  });

  it("never goes negative if details exceed the total", () => {
    expect(
      estimateCostCents("claude-sonnet-4-6", {
        inputTokens: 10,
        outputTokens: 0,
        cacheReadTokens: 50,
        cacheWriteTokens: 50,
      }),
    ).toBeGreaterThanOrEqual(0);
  });
});
