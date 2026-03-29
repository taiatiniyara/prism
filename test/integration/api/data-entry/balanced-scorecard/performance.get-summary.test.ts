import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getScorecardResponse: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/app/data-entry/balanced-scorecard/service", () => ({
  getScorecardResponse: mocks.getScorecardResponse,
}));

describe("balanced scorecard performance contract", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-1",
      role: "DEV",
      role_id: 1,
      org_id: 1,
      email: "dev@example.com",
      name: "Dev",
    });
    mocks.getScorecardResponse.mockResolvedValue({
      context: {
        reportPeriodId: 1,
        reportTypeId: null,
        serviceAreaId: null,
        kpiCategoryId: null,
        kpiSubcategoryId: null,
      },
      snapshot: {
        generatedAt: new Date().toISOString(),
        overallScore: 42,
        perspectiveScores: [],
        excludedSummary: { totalExcluded: 0, byReason: {} },
      },
    });
  });

  it("returns scorecard summary within 3 seconds for representative profile", async () => {
    const { GET } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const started = Date.now();
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/balanced-scorecard?reportPeriodId=1",
      ),
    );
    const elapsedMs = Date.now() - started;

    expect(response.status).toBe(200);
    expect(elapsedMs).toBeLessThan(3000);
  });
});
