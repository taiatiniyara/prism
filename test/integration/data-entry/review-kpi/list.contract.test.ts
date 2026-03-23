import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertReviewKpiReadAccess: vi.fn(),
  sanitizeReviewKpiFilterContext: vi.fn(),
  listReviewKpiRows: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/review-kpi/service", () => ({
  assertReviewKpiReadAccess: mocks.assertReviewKpiReadAccess,
  sanitizeReviewKpiFilterContext: mocks.sanitizeReviewKpiFilterContext,
  listReviewKpiRows: mocks.listReviewKpiRows,
}));

describe("review kpi list route contract", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-1",
      role_name: "admin",
      service_area_id: null,
    });
    mocks.assertReviewKpiReadAccess.mockReturnValue(undefined);
    mocks.sanitizeReviewKpiFilterContext.mockImplementation(
      (context) => context,
    );
    mocks.listReviewKpiRows.mockResolvedValue([]);
  });

  it("returns rows for a valid query", async () => {
    const { GET } = await import("@/app/api/data-entry/review-kpi/route");

    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/review-kpi?reportPeriodId=202401&serviceAreaId=10",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      context: {
        reportTypeId: null,
        reportPeriodId: 202401,
        kpiCategoryId: null,
        kpiSubcategoryId: null,
        serviceAreaId: 10,
      },
      rows: [],
    });
  });

  it("returns 401 when user is unauthenticated", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("Unauthorized"));
    const { GET } = await import("@/app/api/data-entry/review-kpi/route");

    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/review-kpi?reportPeriodId=202401",
      ),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid query parameters", async () => {
    const { GET } = await import("@/app/api/data-entry/review-kpi/route");

    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/review-kpi?reportPeriodId=abc",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "reportPeriodId must be a valid number.",
    });
  });
});
