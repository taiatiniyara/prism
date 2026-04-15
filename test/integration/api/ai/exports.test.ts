import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

describe("POST /api/ai/exports", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
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
  });

  it("returns PDF export payload", async () => {
    const { POST } = await import("@/app/api/ai/exports/route");

    const response = await POST(
      new Request("http://localhost/api/ai/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceId: "trace-1", format: "pdf" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.format).toBe("pdf");
    expect(body.contentType).toBe("application/pdf");
  });

  it("returns CSV export payload", async () => {
    const { POST } = await import("@/app/api/ai/exports/route");

    const response = await POST(
      new Request("http://localhost/api/ai/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceId: "trace-1", format: "csv" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.format).toBe("csv");
    expect(body.contentType).toBe("text/csv");
  });
});
