import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

describe("GET /api/ai/traces", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
  });

  it("returns 200 for DEV reviewer", async () => {
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

    const { GET } = await import("@/app/api/ai/traces/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("returns 403 for non-admin reviewer", async () => {
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

    const { GET } = await import("@/app/api/ai/traces/route");
    const response = await GET();

    expect(response.status).toBe(403);
  });
});
