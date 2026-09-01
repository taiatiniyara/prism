import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  promoteCustomKpiRequestVisibility: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/review-kpi/service", () => ({
  applyCustomKpiReviewDecision: vi.fn(),
  promoteCustomKpiRequestVisibility: mocks.promoteCustomKpiRequestVisibility,
}));

describe("custom KPI promotion POST contract", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.promoteCustomKpiRequestVisibility.mockReset();
  });

  it("returns 200 with promotion payload", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "dev-1", role: "DEV" });
    mocks.promoteCustomKpiRequestVisibility.mockResolvedValue({
      requestId: "req-1",
      visibilityScope: "GLOBAL",
    });

    const { POST } =
      await import("@/app/api/data-entry/custom-kpi/requests/[requestId]/promotion/route");

    const response = await POST(
      new Request(
        "http://localhost/api/data-entry/custom-kpi/requests/req-1/promotion",
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ requestId: "req-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      requestId: "req-1",
      visibilityScope: "GLOBAL",
    });
  });
});
