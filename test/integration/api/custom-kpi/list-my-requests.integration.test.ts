import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listMyCustomKpiRequests: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/settings/kpi/custom-kpi/service", () => ({
  createCustomKpiRequest: vi.fn(),
  listMyCustomKpiRequests: mocks.listMyCustomKpiRequests,
}));

describe("custom KPI request GET mine-list integration", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.listMyCustomKpiRequests.mockReset();
  });

  it("returns 200 and items for current user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
    mocks.listMyCustomKpiRequests.mockResolvedValue([
      {
        id: "r1",
        title: "Total Energy Use",
        status: "PENDING_REVIEW",
        visibility_scope: "SUBMITTER_ONLY",
        replacement_kpi_def_id: null,
        created_at: new Date("2026-04-10T00:00:00.000Z"),
        updated_at: new Date("2026-04-10T00:00:00.000Z"),
      },
    ]);

    const { GET } =
      await import("@/app/api/data-entry/custom-kpi/requests/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0]).toMatchObject({
      id: "r1",
      title: "Total Energy Use",
      status: "PENDING_REVIEW",
    });
  });
});
