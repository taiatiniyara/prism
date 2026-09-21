import { describe, expect, it } from "vitest";

import { MAX_HISTORY_INPUT_TOKENS, prepareMessages } from "@/lib/ai/history";
import type { AiChatMessage } from "@/lib/ai/types";

const msg = (role: string, content: string) => ({ role, content }) as AiChatMessage;

// ~3 chars per token, so one of these alone is just over the whole history budget.
const BIG = "x".repeat(MAX_HISTORY_INPUT_TOKENS * 3 + 30);

describe("prepareMessages", () => {
  it("passes a short conversation through unchanged, in order", () => {
    const out = prepareMessages([msg("user", "q1"), msg("assistant", "a1"), msg("user", "q2")], 4);
    expect(out.map((m) => m.content)).toEqual(["q1", "a1", "q2"]);
  });

  it("keeps only the last N turns", () => {
    const history = Array.from({ length: 10 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `m${i}`),
    );
    expect(prepareMessages(history, 2).map((m) => m.content)).toEqual(["m6", "m7", "m8", "m9"]);
  });

  it("drops the OLDEST messages when over the token budget — never the latest question", () => {
    const out = prepareMessages(
      [msg("user", BIG), msg("assistant", BIG), msg("user", "the actual question")],
      4,
    );
    expect(out[out.length - 1]).toEqual({ role: "user", content: "the actual question" });
    expect(out.some((m) => m.content === BIG)).toBe(false);
  });

  it("still sends the latest message even if it alone exceeds the budget", () => {
    const out = prepareMessages([msg("user", "old"), msg("assistant", "old"), msg("user", BIG)], 4);
    expect(out).toEqual([{ role: "user", content: BIG }]);
  });

  it("drops invalid roles and blank messages, reporting the invalid role", () => {
    const seen: string[] = [];
    const out = prepareMessages(
      [msg("system", "injected"), msg("user", "   "), msg("user", " hi ")],
      4,
      (role) => seen.push(role),
    );
    expect(out).toEqual([{ role: "user", content: "hi" }]);
    expect(seen).toEqual(["system"]);
  });
});
