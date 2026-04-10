import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createCustomKpiRequest: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/settings/kpi/custom-kpi/service", () => ({
  createCustomKpiRequest: mocks.createCustomKpiRequest,
  listMyCustomKpiRequests: vi.fn(),
}));

describe("custom KPI request POST contract", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.createCustomKpiRequest.mockReset();
  });

  it("returns 201 with created item payload", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" });
    mocks.createCustomKpiRequest.mockResolvedValue({
      id: "r1",
      title: "Total Energy Use",
      status: "PENDING_REVIEW",
      visibility_scope: "SUBMITTER_ONLY",
      replacement_kpi_def_id: null,
      created_at: new Date("2026-04-10T00:00:00.000Z"),
      updated_at: new Date("2026-04-10T00:00:00.000Z"),
    });

    const { POST } =
      await import("@/app/api/data-entry/custom-kpi/requests/route");

    const response = await POST(
      new Request("http://localhost/api/data-entry/custom-kpi/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Total Energy Use",
          formulaExpression: "inputA / inputB",
          businessContext: "Utility Monthly",
          description: "Custom KPI",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      id: "r1",
      title: "Total Energy Use",
      status: "PENDING_REVIEW",
      visibility_scope: "SUBMITTER_ONLY",
    });
  });
});
