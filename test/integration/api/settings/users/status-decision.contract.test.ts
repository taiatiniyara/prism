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

describe("status decision contract", () => {
  beforeEach(() => {
    mocks.applyPendingUserDecision.mockReset();
  });

  it("returns 200 and decision payload", async () => {
    mocks.applyPendingUserDecision.mockResolvedValue({
      userId: "u1",
      fromStatus: "pending",
      toStatus: "active",
      applied: true,
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
    expect(body).toMatchObject({
      userId: "u1",
      fromStatus: "pending",
      toStatus: "active",
      applied: true,
      decidedBy: "admin-1",
    });
  });
});
