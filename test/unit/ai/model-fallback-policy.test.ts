import { describe, expect, it } from "vitest";

import { selectModelForExecution } from "@/lib/ai/query.service";

describe("model fallback policy", () => {
  it("uses primary model by default", () => {
    expect(selectModelForExecution()).toBe(
      process.env.AI_PRIMARY_MODEL ?? "gpt-5",
    );
  });

  it("uses fallback in degraded mode", () => {
    expect(selectModelForExecution({ degradedMode: true })).toBe(
      process.env.AI_FALLBACK_MODEL ?? "gpt-5-mini",
    );
  });

  it("uses fallback when explicitly forced", () => {
    expect(selectModelForExecution({ forceFallback: true })).toBe(
      process.env.AI_FALLBACK_MODEL ?? "gpt-5-mini",
    );
  });
});
