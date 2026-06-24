import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  queryResult: [] as unknown[],
  countResult: [{ count: 0 }] as unknown[],
  selectCallCount: 0,
}));

const THENABLE_METHODS = ["select", "from", "where", "orderBy", "limit", "offset", "groupBy"];

function makeThenable(callIndex: number) {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => {
          // First select call in a route call = events, second = count
          const result = callIndex === 0 ? mocks.queryResult : mocks.countResult;
          resolve(result);
          return { catch: () => {} };
        };
      }
      if (prop === "catch") return () => ({ then: () => {} });
      if (THENABLE_METHODS.includes(prop)) return () => makeThenable(callIndex);
      return undefined;
    },
  };
  return new Proxy({}, handler);
}

vi.mock("@/db/connection", () => ({
  db: {
    select: () => {
      const idx = mocks.selectCallCount++;
      return makeThenable(idx);
    },
  },
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

describe("GET /api/logs/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryResult = [];
    mocks.countResult = [{ count: 0 }];
    mocks.selectCallCount = 0;
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("No session"));
    const { GET } = await import("@/app/api/logs/audit/route");
    const response = await GET(new Request("http://localhost/api/logs/audit"));
    expect(response.status).toBe(401);
  });

  it("returns 403 when non-DEV/BMO user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "BLO" });
    const { GET } = await import("@/app/api/logs/audit/route");
    const response = await GET(new Request("http://localhost/api/logs/audit"));
    expect(response.status).toBe(403);
  });

  it("returns audit events for DEV user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "DEV" });
    mocks.queryResult = [
      { id: 1, action: "user.activate", actorEmail: "admin@test", targetType: "user", createdAt: new Date() },
    ];
    mocks.countResult = [{ count: 1 }];

    const { GET } = await import("@/app/api/logs/audit/route");
    const response = await GET(new Request("http://localhost/api/logs/audit"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.events.length).toBe(1);
    expect(body.events[0].action).toBe("user.activate");
    expect(body.total).toBe(1);
  });

  it("filters by action prefix", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "DEV" });
    mocks.queryResult = [];

    const { GET } = await import("@/app/api/logs/audit/route");
    const response = await GET(
      new Request("http://localhost/api/logs/audit?action=user.&limit=50"),
    );
    expect(response.status).toBe(200);
  });

  it("returns CSV when format=csv", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "DEV" });
    mocks.queryResult = [
      { id: 1, action: "user.activate", actorEmail: "admin@test", actorRole: "DEV",
        targetType: "user", targetId: "u2", details: null, ipAddress: "127.0.0.1", createdAt: new Date("2026-01-01") },
    ];

    const { GET } = await import("@/app/api/logs/audit/route");
    const response = await GET(
      new Request("http://localhost/api/logs/audit?format=csv"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    const text = await response.text();
    expect(text).toContain("id,action,actor_email");
  });
});
