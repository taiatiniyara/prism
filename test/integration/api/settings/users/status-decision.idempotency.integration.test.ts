import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  applyPendingUserDecision: vi.fn(),
}));

vi.mock("@/app/settings/users/service", () => ({
  applyPendingUserDecision: mocks.applyPendingUserDecision,
}));

describe("status decision idempotency integration", () => {
  beforeEach(() => {
    mocks.applyPendingUserDecision.mockReset();
  });

  it("returns applied=false when decision is repeated", async () => {
    mocks.applyPendingUserDecision.mockResolvedValue({
      userId: "u1",
      fromStatus: "active",
      toStatus: "active",
      applied: false,
      rejectionReason: null,
      decidedAt: new Date("2026-01-01T00:00:00.000Z"),
      decidedBy: "admin-1",
    });

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

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.applied).toBe(false);
    expect(body.toStatus).toBe("active");
  });
});
