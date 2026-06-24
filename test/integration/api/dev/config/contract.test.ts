import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

describe("GET /api/dev/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("No session"));

    const { GET } = await import("@/app/api/dev/config/route");

    const response = await GET(new Request("http://localhost/api/dev/config"));
    expect(response.status).toBe(401);
  });

  it("returns 403 when non-DEV user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "BLO" });

    const { GET } = await import("@/app/api/dev/config/route");

    const response = await GET(new Request("http://localhost/api/dev/config"));
    expect(response.status).toBe(403);
  });

  it("returns config data for DEV user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "DEV" });

    const { GET } = await import("@/app/api/dev/config/route");

    const response = await GET(new Request("http://localhost/api/dev/config"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.vars).toBeDefined();
    expect(Array.isArray(body.vars)).toBe(true);
    expect(body.flags).toBeDefined();
    expect(Array.isArray(body.flags)).toBe(true);
    expect(body.missingFromExample).toBeDefined();
  });
});
