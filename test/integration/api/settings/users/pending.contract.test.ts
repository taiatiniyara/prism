import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPendingUsers: vi.fn(),
}));

vi.mock("@/app/settings/users/service", () => ({
  listPendingUsers: mocks.listPendingUsers,
}));

describe("pending users contract", () => {
  beforeEach(() => {
    mocks.listPendingUsers.mockReset();
  });

  it("returns 200 and items payload", async () => {
    mocks.listPendingUsers.mockResolvedValue([
      {
        id: "u1",
        name: "Pending User",
        email: "pending@example.com",
        organisation: "ORG",
        registrationDate: new Date("2026-01-01T00:00:00.000Z"),
        datasetRequired: "KPI",
        dataAccessReason: "Reporting",
        status: "pending",
      },
    ]);

    const { GET } = await import("@/app/api/settings/users/pending/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0]).toMatchObject({
      id: "u1",
      status: "pending",
      email: "pending@example.com",
    });
  });

  it("returns 403 when service reports forbidden", async () => {
    mocks.listPendingUsers.mockRejectedValue(
      new Error("FORBIDDEN: only BMO/DEV users can perform this action"),
    );

    const { GET } = await import("@/app/api/settings/users/pending/route");
    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("returns 401 when unauthorized", async () => {
    mocks.listPendingUsers.mockRejectedValue(new Error("Unauthorized"));

    const { GET } = await import("@/app/api/settings/users/pending/route");
    const response = await GET();

    expect(response.status).toBe(401);
  });
});
