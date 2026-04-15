import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

describe("POST /api/ai/query forbidden role", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
  });

  it("returns 403 for non-launch roles", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-1",
      role: "VIEWER",
      name: "Viewer",
      email: "viewer@example.com",
      role_id: null,
      org_id: null,
      status: "active",
      reject_reason: null,
    });

    const { POST } = await import("@/app/api/ai/query/route");

    const response = await POST(
      new Request("http://localhost/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "show completeness",
          queryClass: "completeness",
          filterContext: { reportPeriodId: 1 },
        }),
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("FORBIDDEN");
  });
});
