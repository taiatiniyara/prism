import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getScorecardResponse: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/app/data-entry/balanced-scorecard/service", () => ({
  getScorecardResponse: mocks.getScorecardResponse,
}));

describe("balanced scorecard filters integration", () => {
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
        reportTypeId: 2,
        serviceAreaId: 3,
        kpiCategoryId: 4,
        kpiSubcategoryId: 5,
      },
      snapshot: {
        generatedAt: new Date().toISOString(),
        overallScore: 50,
        perspectiveScores: [],
        excludedSummary: { totalExcluded: 0, byReason: {} },
      },
    });
  });

  it("accepts filter query params and returns context", async () => {
    const { GET } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/balanced-scorecard?reportPeriodId=1&reportTypeId=2&serviceAreaId=3&kpiCategoryId=4&kpiSubcategoryId=5",
      ),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.context.reportTypeId).toBe(2);
    expect(data.context.serviceAreaId).toBe(3);
  });
});
