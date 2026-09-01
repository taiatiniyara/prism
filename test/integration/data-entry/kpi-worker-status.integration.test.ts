import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listKpiWorkerStatuses: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/kpi-worker/status.service", () => ({
  listKpiWorkerStatuses: mocks.listKpiWorkerStatuses,
}));

describe("kpi worker status route", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.listKpiWorkerStatuses.mockReset();
  });

  it("returns status payload for valid filter query", async () => {
    mocks.listKpiWorkerStatuses.mockResolvedValue([
      {
        id: "attempt-1",
        triggerId: "trigger-1",
        kpiDefId: 10,
        status: "completed",
        retryCount: 0,
        formulaVersion: "v1",
        failureReason: null,
        failureType: null,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        updatedAt: "2026-01-01T00:00:01.000Z",
      },
    ]);

    const { GET } =
      await import("@/app/api/data-entry/kpi-worker/status/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/kpi-worker/status?reportPeriodId=12&serviceAreaId=9",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(1);
    expect(mocks.listKpiWorkerStatuses).toHaveBeenCalledWith({
      reportPeriodId: 12,
      serviceAreaId: 9,
      unitId: undefined,
    });
  });

  it("returns empty list when KPI status schema is not yet available", async () => {
    const dbError = Object.assign(new Error("relation does not exist"), {
      code: "42P01",
    });
    mocks.listKpiWorkerStatuses.mockRejectedValue(dbError);

    const { GET } =
      await import("@/app/api/data-entry/kpi-worker/status/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/kpi-worker/status?reportPeriodId=12",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it("returns empty list for kpi attempt query failures without PG error code", async () => {
    mocks.listKpiWorkerStatuses.mockRejectedValue(
      new Error(
        'Failed query: select "id" from "kpi_calculation_attempts" where "kpi_calculation_attempts"."report_period_id" = $1',
      ),
    );

    const { GET } =
      await import("@/app/api/data-entry/kpi-worker/status/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/kpi-worker/status?reportPeriodId=169&serviceAreaId=2",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
