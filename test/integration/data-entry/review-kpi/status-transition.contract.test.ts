import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  updateStatus: vi.fn(),
  bulkAdvance: vi.fn(),
  bootstrapContext: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/review-kpi/service", () => ({
  updateReviewKpiInputStatus: mocks.updateStatus,
  bulkAdvanceEnteredToReviewed: mocks.bulkAdvance,
  bootstrapReviewKpiContextAndOptions: mocks.bootstrapContext,
}));

const dataEntryId = "5f18315d-b2ee-4fc9-a9f2-430b357f3119";

describe("review kpi status transition route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", role: "BLO", org_id: 1 });
  });

  it("advances status and returns the updated input", async () => {
    mocks.updateStatus.mockResolvedValue({
      input: {
        dataEntryId,
        status: { id: 4, code: "Reviewed", label: "BLO Reviewed", color: "#34d399", publishable: false },
      },
      result: { status: "calculated" },
    });

    const { PATCH } = await import(
      "@/app/api/data-entry/review-kpi/inputs/[dataEntryId]/status/route"
    );

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          statusId: 4,
          updatedAt: "2026-03-24T00:00:00.000Z",
          kpiDefId: 1001,
        }),
      }),
      { params: Promise.resolve({ dataEntryId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.input.status.code).toBe("Reviewed");
  });

  it("returns 403 when the transition isn't allowed for the caller's role", async () => {
    mocks.updateStatus.mockRejectedValue(
      new Error("FORBIDDEN:You are not allowed to make this status change."),
    );

    const { PATCH } = await import(
      "@/app/api/data-entry/review-kpi/inputs/[dataEntryId]/status/route"
    );

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          statusId: 5,
          updatedAt: "2026-03-24T00:00:00.000Z",
          kpiDefId: 1001,
        }),
      }),
      { params: Promise.resolve({ dataEntryId }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns 400 when the requested transition is illegal", async () => {
    mocks.updateStatus.mockRejectedValue(
      new Error(
        "VALIDATION:Cannot move this input from its current status to the requested one.",
      ),
    );

    const { PATCH } = await import(
      "@/app/api/data-entry/review-kpi/inputs/[dataEntryId]/status/route"
    );

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          statusId: 5,
          updatedAt: "2026-03-24T00:00:00.000Z",
          kpiDefId: 1001,
        }),
      }),
      { params: Promise.resolve({ dataEntryId }) },
    );

    expect(response.status).toBe(400);
  });

  it("rejects a payload missing statusId", async () => {
    const { PATCH } = await import(
      "@/app/api/data-entry/review-kpi/inputs/[dataEntryId]/status/route"
    );

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          updatedAt: "2026-03-24T00:00:00.000Z",
          kpiDefId: 1001,
        }),
      }),
      { params: Promise.resolve({ dataEntryId }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.updateStatus).not.toHaveBeenCalled();
  });
});

describe("review kpi bulk-advance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", role: "BLO", org_id: 1 });
    mocks.bootstrapContext.mockResolvedValue({
      context: {
        reportTypeId: 1,
        reportPeriodId: 202401,
        kpiCategoryId: null,
        kpiSubcategoryId: null,
        serviceAreaId: null,
      },
      options: {},
    });
  });

  it("advances eligible entries and reports how many were held", async () => {
    mocks.bulkAdvance.mockResolvedValue({ advanced: 3, held: 1 });

    const { POST } = await import(
      "@/app/api/data-entry/review-kpi/bulk-advance/route"
    );

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ advanced: 3, held: 1 });
  });

  it("returns 400 when no report period is selected", async () => {
    mocks.bootstrapContext.mockResolvedValue({
      context: {
        reportTypeId: null,
        reportPeriodId: null,
        kpiCategoryId: null,
        kpiSubcategoryId: null,
        serviceAreaId: null,
      },
      options: {},
    });

    const { POST } = await import(
      "@/app/api/data-entry/review-kpi/bulk-advance/route"
    );

    const response = await POST();

    expect(response.status).toBe(400);
    expect(mocks.bulkAdvance).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller can't review", async () => {
    mocks.bulkAdvance.mockRejectedValue(
      new Error("FORBIDDEN:You are not allowed to advance entries to Reviewed."),
    );

    const { POST } = await import(
      "@/app/api/data-entry/review-kpi/bulk-advance/route"
    );

    const response = await POST();

    expect(response.status).toBe(403);
  });
});
