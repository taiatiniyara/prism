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

describe("decision flow triggers email enqueue integration", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.applyCustomKpiReviewDecision.mockReset();
  });

  it("returns decision payload from a decision that enqueues email delivery", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "dev-1", role: "DEV" });
    mocks.applyCustomKpiReviewDecision.mockResolvedValue({
      requestId: "req-1",
      decisionId: "dec-1",
      status: "APPROVED",
      visibilityScope: "SUBMITTER_ONLY",
    });

    const { POST } =
      await import("@/app/api/data-entry/custom-kpi/requests/[requestId]/decision/route");

    const response = await POST(
      new Request(
        "http://localhost/api/data-entry/custom-kpi/requests/req-1/decision",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decisionType: "APPROVE",
            rationale: "Valid and actionable",
            override: false,
          }),
        },
      ),
      { params: Promise.resolve({ requestId: "req-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.applyCustomKpiReviewDecision).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.decisionId).toBe("dec-1");
  });
});
