import { beforeEach, describe, expect, it, vi } from "vitest";

import { publishSyncEvent } from "@/app/data-entry/review-kpi/sync-store";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  assertReadAccess: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/review-kpi/service", () => ({
  assertReviewKpiReadAccess: mocks.assertReadAccess,
}));

describe("review kpi sync events", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", role: "DEV" });
    mocks.assertReadAccess.mockReturnValue(undefined);
  });

  it("returns scoped catch-up events for reconnect payload requests", async () => {
    publishSyncEvent({
      eventId: crypto.randomUUID(),
      eventType: "input-updated",
      occurredAt: new Date().toISOString(),
      reportPeriodId: 202401,
      serviceAreaId: 10,
      kpiDefId: 1001,
      inputDefId: 9001,
      dataEntryId: "0f20ab57-f1f0-4faf-b2d8-6f3f36f8c3df",
      payload: { value: "22" },
    });

    publishSyncEvent({
      eventId: crypto.randomUUID(),
      eventType: "input-updated",
      occurredAt: new Date().toISOString(),
      reportPeriodId: 202401,
      serviceAreaId: 99,
      kpiDefId: 1001,
      inputDefId: 9001,
      dataEntryId: "0f20ab57-f1f0-4faf-b2d8-6f3f36f8c3df",
      payload: { value: "20" },
    });

    const { GET } = await import("@/app/api/data-entry/review-kpi/events/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/review-kpi/events?reportPeriodId=202401&serviceAreaId=10&sinceEventId=cursor-1",
      ),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { events: Array<{ serviceAreaId: number | null }> };
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events.every((event) => event.serviceAreaId === 10)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("Unauthorized"));
    const { GET } = await import("@/app/api/data-entry/review-kpi/events/route");

    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/review-kpi/events?reportPeriodId=202401&sinceEventId=cursor-1",
      ),
    );

    expect(response.status).toBe(401);
  });
});
