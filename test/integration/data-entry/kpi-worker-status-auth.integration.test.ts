import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/kpi-worker/status.service", () => ({
  listKpiWorkerStatuses: vi.fn(),
}));

describe("kpi worker status auth", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
  });

  it("denies unauthorized status route access", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("auth session missing"));

    const { GET } =
      await import("@/app/api/data-entry/kpi-worker/status/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/kpi-worker/status?reportPeriodId=1",
      ),
    );

    expect(response.status).toBe(401);
  });
});
