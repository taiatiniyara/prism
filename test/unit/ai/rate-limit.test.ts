import { describe, expect, it } from "vitest";

import { recordRequest, recordToolCall, recordError } from "@/lib/ai/rate-limit";

describe("usage tracking", () => {
  it("recordRequest is a function", () => {
    expect(typeof recordRequest).toBe("function");
  });

  it("recordToolCall is a function", () => {
    expect(typeof recordToolCall).toBe("function");
  });

  it("recordError is a function", () => {
    expect(typeof recordError).toBe("function");
  });
});
