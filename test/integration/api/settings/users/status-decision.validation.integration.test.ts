import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyPendingUserDecision: vi.fn(),
}));

vi.mock("@/app/settings/users/service", () => ({
  applyPendingUserDecision: mocks.applyPendingUserDecision,
}));

describe("status decision validation integration", () => {
  beforeEach(() => {
    mocks.applyPendingUserDecision.mockReset();
  });

  it("returns 400 when reject reason is missing", async () => {
    const { POST } =
      await import("@/app/api/settings/users/[userId]/status/route");

    const response = await POST(
      new Request("http://localhost/api/settings/users/u1/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject", rejectionReason: "" }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.applyPendingUserDecision).not.toHaveBeenCalled();
  });
});
