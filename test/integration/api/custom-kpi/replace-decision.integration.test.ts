import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  applyCustomKpiReviewDecision: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/review-kpi/service", () => ({
  applyCustomKpiReviewDecision: mocks.applyCustomKpiReviewDecision,
  promoteCustomKpiRequestVisibility: vi.fn(),
}));

describe("replace decision validation", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.applyCustomKpiReviewDecision.mockReset();
  });

  it("returns 400 when REPLACE is missing replacementKpiId", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "dev-1", role: "DEV" });

    const { POST } =
      await import("@/app/api/data-entry/custom-kpi/requests/[requestId]/decision/route");

    const response = await POST(
      new Request(
        "http://localhost/api/data-entry/custom-kpi/requests/req-1/decision",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decisionType: "REPLACE",
            rationale: "Use existing KPI",
            override: false,
          }),
        },
      ),
      { params: Promise.resolve({ requestId: "req-1" }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message).toContain("replacementKpiId is required");
    expect(mocks.applyCustomKpiReviewDecision).not.toHaveBeenCalled();
  });
});
