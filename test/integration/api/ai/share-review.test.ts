import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

describe("POST /api/ai/reports/{reportId}/share", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
  });

  it("allows DEV reviewer decisions", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-1",
      role: "DEV",
      name: "Developer",
      email: "dev@example.com",
      role_id: 1,
      org_id: 1,
      status: "active",
      reject_reason: null,
    });

    const { POST } =
      await import("@/app/api/ai/reports/[reportId]/share/route");

    const response = await POST(
      new Request("http://localhost/api/ai/reports/r-1/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceId: "trace-1", decision: "APPROVED" }),
      }),
      { params: Promise.resolve({ reportId: "r-1" }) },
    );

    expect(response.status).toBe(200);
  });

  it("blocks non DEV/BMO reviewer decisions", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-2",
      role: "BLO",
      name: "Blocked",
      email: "blo@example.com",
      role_id: 2,
      org_id: 1,
      status: "active",
      reject_reason: null,
    });

    const { POST } =
      await import("@/app/api/ai/reports/[reportId]/share/route");

    const response = await POST(
      new Request("http://localhost/api/ai/reports/r-1/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceId: "trace-1", decision: "APPROVED" }),
      }),
      { params: Promise.resolve({ reportId: "r-1" }) },
    );

    expect(response.status).toBe(403);
  });
});
