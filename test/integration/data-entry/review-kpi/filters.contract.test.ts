import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertReviewKpiReadAccess: vi.fn(),
  listReviewKpiRows: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/review-kpi/service", async () => {
  const actual = await vi.importActual<typeof import("@/app/data-entry/review-kpi/service")>(
    "@/app/data-entry/review-kpi/service",
  );

  return {
    ...actual,
    assertReviewKpiReadAccess: mocks.assertReviewKpiReadAccess,
    listReviewKpiRows: mocks.listReviewKpiRows,
  };
});

describe("review kpi filter route contract", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", role: "DEV" });
    mocks.assertReviewKpiReadAccess.mockReturnValue(undefined);
    mocks.listReviewKpiRows.mockResolvedValue([]);
  });

  it("rejects query when reportPeriodId is missing", async () => {
    const { GET } = await import("@/app/api/data-entry/review-kpi/route");

    const response = await GET(
      new Request("http://localhost/api/data-entry/review-kpi?kpiCategoryId=515"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "reportPeriodId is required.",
    });
  });

  it("drops subcategory when category is missing", async () => {
    const { GET } = await import("@/app/api/data-entry/review-kpi/route");

    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/review-kpi?reportPeriodId=202401&kpiSubcategoryId=600",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      context: {
        reportTypeId: null,
        reportPeriodId: 202401,
        kpiCategoryId: null,
        kpiSubcategoryId: null,
        serviceAreaId: null,
      },
      rows: [],
    });
  });
});
