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

// Mirror of lib/ai/service.ts's withFirstChunkCheck — peeks the first part of
// streamText's fullStream so provider errors that land before any output (429/503/
// overloaded) throw synchronously and can be retried/failed-over, instead of only
// surfacing later as an unrecoverable "error" part after the caller has started
// consuming the stream.
const withFirstChunkCheck = async <T extends { type: string; error?: unknown }>(
  fullStream: AsyncIterable<T>,
): Promise<AsyncIterable<T>> => {
  const iterator = fullStream[Symbol.asyncIterator]();
  const first = await iterator.next();

  if (!first.done && first.value.type === "error") {
    const err = first.value.error;
    throw err instanceof Error ? err : new Error(String(err));
  }

  return {
    [Symbol.asyncIterator]() {
      let firstYielded = first.done ?? false;
      return {
        next: (): Promise<IteratorResult<T>> => {
          if (!firstYielded) {
            firstYielded = true;
            return Promise.resolve(first as IteratorResult<T>);
          }
          return iterator.next();
        },
      };
    },
  };
};

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

describe("withFirstChunkCheck (stream error peeking)", () => {
  it("throws synchronously when the first part is an error", async () => {
    const source = toAsyncIterable([{ type: "error", error: new Error("overloaded") }]);
    await expect(withFirstChunkCheck(source)).rejects.toThrow("overloaded");
  });

  it("wraps a non-Error error value", async () => {
    const source = toAsyncIterable([{ type: "error", error: "rate limited" }]);
    await expect(withFirstChunkCheck(source)).rejects.toThrow("rate limited");
  });

  it("replays the peeked first part plus the rest, unchanged", async () => {
    const source = toAsyncIterable([
      { type: "text-delta", text: "a" },
      { type: "text-delta", text: "b" },
      { type: "finish" },
    ]);
    const checked = await withFirstChunkCheck(source);
    expect(await collect(checked)).toEqual([
      { type: "text-delta", text: "a" },
      { type: "text-delta", text: "b" },
      { type: "finish" },
    ]);
  });

  it("does not throw when an error part arrives after the first chunk", async () => {
    const source = toAsyncIterable([
      { type: "text-delta", text: "a" },
      { type: "error", error: new Error("mid-stream failure") },
    ]);
    const checked = await withFirstChunkCheck(source);
    await expect(collect(checked)).resolves.toEqual([
      { type: "text-delta", text: "a" },
      { type: "error", error: new Error("mid-stream failure") },
    ]);
  });

  it("handles an empty stream without throwing", async () => {
    const source = toAsyncIterable<{ type: string }>([]);
    const checked = await withFirstChunkCheck(source);
    expect(await collect(checked)).toEqual([]);
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
