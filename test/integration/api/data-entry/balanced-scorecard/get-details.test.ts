import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getScorecardResponse: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/app/data-entry/balanced-scorecard/service", () => ({
  getScorecardResponse: mocks.getScorecardResponse,
}));

describe("balanced scorecard details integration", () => {
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
        overallScore: 50,
        perspectiveScores: [
          {
            perspectiveLevel: 1,
            perspectiveLabel: "Financial",
            weightedScore: 50,
            includedCount: 1,
            excludedCount: 1,
            statusBreakdown: { onTrack: 0, atRisk: 1, offTrack: 0 },
            exclusions: [
              {
                kpiId: "k-1",
                reasonCode: "MISSING_TARGET",
                reasonMessage: "Missing target",
              },
            ],
          },
        ],
        excludedSummary: { totalExcluded: 1, byReason: { MISSING_TARGET: 1 } },
      },
    });
  });

  it("returns perspective details with exclusion reasons", async () => {
    const { GET } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/balanced-scorecard?reportPeriodId=1",
      ),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.snapshot.perspectiveScores[0].exclusions[0].reasonCode).toBe(
      "MISSING_TARGET",
    );
  });
});
