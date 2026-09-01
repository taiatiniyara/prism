import { describe, it, expect, beforeEach } from "vitest";

// Mirror of the circuit breaker logic
const createCircuitBreaker = () => {
  const map = new Map<string, { count: number; lastFail: number; cooldownUntil: number }>();
  const MAX_FAILURES = 5;
  const COOLDOWN_MS = 60000;

  return {
    recordFailure: (toolName: string, now = Date.now()): boolean => {
      const entry = map.get(toolName) ?? { count: 0, lastFail: 0, cooldownUntil: 0 };

      if (now < entry.cooldownUntil) return false;

      entry.count++;
      entry.lastFail = now;

      if (entry.count >= MAX_FAILURES) {
        entry.cooldownUntil = now + COOLDOWN_MS;
        entry.count = 0;
        return false;
      }

      map.set(toolName, entry);
      return true;
    },
    reset: (toolName: string) => map.delete(toolName),
    getStatus: () => [...map.entries()],
  };
};

describe("Circuit breaker", () => {
  let cb: ReturnType<typeof createCircuitBreaker>;

  beforeEach(() => {
    cb = createCircuitBreaker();
  });

  it("allows initial failures", () => {
    for (let i = 0; i < 4; i++) {
      expect(cb.recordFailure("test_tool")).toBe(true);
    }
  });

  it("opens circuit after MAX_FAILURES", () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure("test_tool");
    }
    expect(cb.recordFailure("test_tool")).toBe(false);
  });

  it("cooldown prevents further attempts", () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      cb.recordFailure("test_tool", now);
    }
    expect(cb.recordFailure("test_tool", now + 10000)).toBe(false);
  });

  it("allows after cooldown expires", () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      cb.recordFailure("test_tool", now);
    }
    expect(cb.recordFailure("test_tool", now + 61000)).toBe(true);
  });

  it("reset clears circuit", () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure("test_tool");
    }
    cb.reset("test_tool");
    expect(cb.recordFailure("test_tool")).toBe(true);
  });

  it("tracks separate tools independently", () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure("tool_a");
    }
    expect(cb.recordFailure("tool_b")).toBe(true);
    expect(cb.recordFailure("tool_a")).toBe(false);
  });
});
