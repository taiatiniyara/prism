import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getScorecardResponse: vi.fn(),
  saveScorecardConfiguration: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/balanced-scorecard/service", () => ({
  getScorecardResponse: mocks.getScorecardResponse,
  saveScorecardConfiguration: mocks.saveScorecardConfiguration,
}));

describe("balanced scorecard route contract", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-1",
      role: "DEV",
      role_id: 1,
      org_id: 1,
      email: "test@example.com",
      name: "User",
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
        overallScore: 85,
        perspectiveScores: [],
        excludedSummary: { totalExcluded: 0, byReason: {} },
      },
    });

    mocks.saveScorecardConfiguration.mockResolvedValue({
      kpiId: "11111111-1111-1111-1111-111111111111",
      perspectiveLevel: 1,
      perspectiveDescription: "Financial outcomes",
      strategicObjective: "Improve reliability",
      keyInitiative: "Reduce outage response time",
      trackingFrequency: "monthly",
      target: {
        year: 2026,
        month: 3,
        targetValue: "95",
      },
      reportDate: new Date().toISOString(),
    });
  });

  it("returns scorecard payload for valid query", async () => {
    const { GET } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/balanced-scorecard?reportPeriodId=1",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getScorecardResponse).toHaveBeenCalledTimes(1);
  });

  it("returns 401 for unauthenticated access", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("Unauthorized"));
    const { GET } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/balanced-scorecard?reportPeriodId=1",
      ),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid query parameters", async () => {
    const { GET } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/balanced-scorecard?reportPeriodId=abc",
      ),
    );

    expect(response.status).toBe(400);
  });

  it("returns 403 for forbidden access", async () => {
    mocks.getScorecardResponse.mockRejectedValue(
      new Error("FORBIDDEN:You are not allowed to access scorecard data."),
    );
    const { GET } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/balanced-scorecard?reportPeriodId=1",
      ),
    );

    expect(response.status).toBe(403);
  });

  it("accepts scorecard KPI update payload", async () => {
    const { POST } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await POST(
      new Request("http://localhost/api/data-entry/balanced-scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpiId: "11111111-1111-1111-1111-111111111111",
          kpiDefinitionId: 10,
          perspectiveLevel: 2,
          perspectiveDescription: "Customer trust",
          strategicObjective: "Improve customer outcomes",
          keyInitiative: "First-contact resolution",
          trackingFrequency: "monthly",
          target: {
            year: 2026,
            month: 4,
            targetValue: "91.5",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.saveScorecardConfiguration).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when update payload is invalid", async () => {
    const { POST } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await POST(
      new Request("http://localhost/api/data-entry/balanced-scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpiId: null,
          kpiDefinitionId: -2,
          perspectiveLevel: 8,
          strategicObjective: "",
          keyInitiative: "",
          target: { year: 20, targetValue: "" },
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when multiple FY periods exist and month is omitted", async () => {
    mocks.saveScorecardConfiguration.mockRejectedValue(
      new Error(
        "VALIDATION:Multiple financial-year periods found for target year. Provide month to select a monthly period.",
      ),
    );

    const { POST } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await POST(
      new Request("http://localhost/api/data-entry/balanced-scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kpiId: null,
          kpiDefinitionId: 10,
          perspectiveLevel: 2,
          strategicObjective: "Improve customer outcomes",
          keyInitiative: "First-contact resolution",
          target: {
            year: 2026,
            month: null,
            targetValue: "91.5",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.message).toBe(
      "Multiple financial-year periods found for target year. Provide month to select a monthly period.",
    );
  });
});
