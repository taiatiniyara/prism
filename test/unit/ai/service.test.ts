import { describe, it, expect } from "vitest";
import { AI_MODELS, AI_DEFAULTS } from "@/lib/ai/types";

describe("AI Models config", () => {
  it("has primary model defined", () => {
    expect(AI_MODELS.primary).toBeTruthy();
    expect(typeof AI_MODELS.primary).toBe("string");
  });

  it("has fallback model defined", () => {
    expect(AI_MODELS.fallback).toBeTruthy();
    expect(typeof AI_MODELS.fallback).toBe("string");
  });

  it("has defaults defined", () => {
    expect(AI_DEFAULTS.max_message_length).toBeGreaterThan(0);
    expect(AI_DEFAULTS.max_history_turns).toBeGreaterThan(0);
  });
});

describe("Token estimation", () => {
  const estimateTokens = (text: string): number => Math.ceil(text.length / 3);

  it("estimates zero for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates correctly for English text", () => {
    const text = "This is a test sentence about utility performance metrics.";
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(Math.ceil(text.length / 2));
  });

  it("is more conservative than chars/4", () => {
    const text = "a".repeat(1000);
    const chars3 = Math.ceil(text.length / 3);
    const chars4 = Math.ceil(text.length / 4);
    expect(chars3).toBeGreaterThan(chars4);
  });
});
