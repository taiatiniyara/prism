import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";

import {
  ANTHROPIC_CACHE_CONTROL,
  withCachedLastTool,
  withMovingCacheBreakpoint,
} from "@/lib/ai/cache-control";

const marker = (m: ModelMessage) => m.providerOptions?.anthropic?.cacheControl;
const countMarkers = (messages: ModelMessage[]) => messages.filter((m) => marker(m) != null).length;

const user = (content: string): ModelMessage => ({ role: "user", content });
const assistant = (content: string): ModelMessage => ({ role: "assistant", content });

describe("withCachedLastTool", () => {
  it("marks only the last tool, preserving key order", () => {
    const out = withCachedLastTool({ a: { description: "a" }, b: { description: "b" } }) as Record<
      string,
      { providerOptions?: unknown }
    >;
    expect(Object.keys(out)).toEqual(["a", "b"]);
    expect(out.a.providerOptions).toBeUndefined();
    expect(out.b.providerOptions).toEqual(ANTHROPIC_CACHE_CONTROL);
  });

  it("returns an empty tool set unchanged", () => {
    expect(withCachedLastTool({})).toEqual({});
  });
});

describe("withMovingCacheBreakpoint", () => {
  it("marks the last message only", () => {
    const out = withMovingCacheBreakpoint([user("q1"), assistant("a1"), user("q2")]);
    expect(countMarkers(out)).toBe(1);
    expect(marker(out[2])).toEqual({ type: "ephemeral" });
  });

  it("moves the marker forward as the tool loop appends messages (never accumulates)", () => {
    // prepareStep overrides carry forward, so step N receives step N-1's marked messages.
    let messages = withMovingCacheBreakpoint([user("q")]);
    for (let step = 0; step < 6; step++) {
      messages = withMovingCacheBreakpoint([
        ...messages,
        assistant(`tool call ${step}`),
        { role: "tool", content: [] } as ModelMessage,
      ]);
      expect(countMarkers(messages)).toBe(1);
      expect(marker(messages[messages.length - 1])).toBeDefined();
    }
  });

  it("leaves message content and other provider options untouched", () => {
    const withOther: ModelMessage = {
      role: "user",
      content: "q",
      providerOptions: { anthropic: { cacheControl: { type: "ephemeral" }, other: 1 }, openai: { x: 1 } },
    };
    const out = withMovingCacheBreakpoint([withOther, user("latest")]);
    expect(out[0].content).toBe("q");
    expect(out[0].providerOptions).toEqual({ anthropic: { other: 1 }, openai: { x: 1 } });
  });

  it("drops providerOptions entirely when the marker was all it held", () => {
    const out = withMovingCacheBreakpoint(withMovingCacheBreakpoint([user("q")]).concat(user("next")));
    expect("providerOptions" in out[0]).toBe(false);
  });

  it("does not mutate its input", () => {
    const input = [user("q1"), user("q2")];
    withMovingCacheBreakpoint(input);
    expect(countMarkers(input)).toBe(0);
  });

  it("handles an empty conversation", () => {
    expect(withMovingCacheBreakpoint([])).toEqual([]);
  });
});
