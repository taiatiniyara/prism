import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyPendingUserDecision: vi.fn(),
}));

vi.mock("@/app/settings/users/service", () => ({
  applyPendingUserDecision: mocks.applyPendingUserDecision,
}));

describe("status decision authz integration", () => {
  beforeEach(() => {
    mocks.applyPendingUserDecision.mockReset();
  });

  it("returns 403 when user lacks BMO/DEV role", async () => {
    mocks.applyPendingUserDecision.mockRejectedValue(
      new Error("FORBIDDEN: only BMO/DEV users can perform this action"),
    );

    const { POST } =
      await import("@/app/api/settings/users/[userId]/status/route");

    const response = await POST(
      new Request("http://localhost/api/settings/users/u1/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "activate" }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(403);
  });
});
