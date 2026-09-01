import { describe, it, expect } from "vitest";

function persistResponseFallback(
  turn: { id: number; assistant_response: string | null } | null,
  content: string,
): { status: number; saved: number; already_persisted?: boolean } {
  if (!turn) {
    return { status: 404, saved: 0 };
  }

  if (turn.assistant_response) {
    return { status: 200, saved: 0, already_persisted: true };
  }

  const filtered = content.trim();
  if (!filtered) {
    return { status: 400, saved: 0 };
  }

  return { status: 200, saved: filtered.length };
}

describe("AI response persistence idempotency", () => {
  it("saves response when turn has no existing assistant_response", () => {
    const turn = { id: 1, assistant_response: null };
    const result = persistResponseFallback(turn, "Hello, here is your analysis.");
    expect(result.status).toBe(200);
    expect(result.saved).toBeGreaterThan(0);
    expect(result.already_persisted).toBeUndefined();
  });

  it("does not overwrite an already-persisted response", () => {
    const turn = { id: 1, assistant_response: "Already saved by onFinish" };
    const result = persistResponseFallback(turn, "This should not be saved.");
    expect(result.status).toBe(200);
    expect(result.saved).toBe(0);
    expect(result.already_persisted).toBe(true);
  });

  it("returns 404 when turn does not exist", () => {
    const result = persistResponseFallback(null, "test");
    expect(result.status).toBe(404);
  });

  it("rejects empty content", () => {
    const turn = { id: 1, assistant_response: null };
    const result = persistResponseFallback(turn, "   ");
    expect(result.status).toBe(400);
    expect(result.saved).toBe(0);
  });

  it("rejects whitespace-only content", () => {
    const turn = { id: 1, assistant_response: null };
    const result = persistResponseFallback(turn, "\n\t ");
    expect(result.status).toBe(400);
  });
});
