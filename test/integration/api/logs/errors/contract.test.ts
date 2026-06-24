import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  queryResult: [] as unknown[],
  statsResult: [] as unknown[],
  updateSetWhere: vi.fn(),
}));

const THENABLE_METHODS = ["select", "from", "where", "orderBy", "limit", "offset", "groupBy", "set"];

function makeThenable(resultRef: () => unknown) {
  const handler: ProxyHandler<object> = {
    get(_target, prop: string) {
      if (prop === "then") return (resolve: (v: unknown) => void) => { resolve(resultRef()); return { catch: () => {} }; };
      if (prop === "catch") return () => ({ then: () => {} });
      if (THENABLE_METHODS.includes(prop)) return () => makeThenable(resultRef);
      return undefined;
    },
  };
  return new Proxy({}, handler);
}

let selectCallCount = 0;

vi.mock("@/db/connection", () => ({
  db: {
    select: () => {
      selectCallCount++;
      // First select = errors query, second = stats query
      const isStats = selectCallCount % 2 === 0;
      return makeThenable(() => isStats ? mocks.statsResult : mocks.queryResult);
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: mocks.updateSetWhere,
      })),
    })),
  },
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

describe("GET /api/logs/errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
    mocks.queryResult = [];
    mocks.statsResult = [];
    mocks.updateSetWhere.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("No session"));

    const { GET } = await import("@/app/api/logs/errors/route");

    const response = await GET(new Request("http://localhost/api/logs/errors"));
    expect(response.status).toBe(401);
  });

  it("returns 403 when non-DEV/BMO user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "BLO" });

    const { GET } = await import("@/app/api/logs/errors/route");

    const response = await GET(new Request("http://localhost/api/logs/errors"));
    expect(response.status).toBe(403);
  });

  it("returns errors list for DEV user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "DEV" });
    mocks.queryResult = [
      { id: 1, severity: "error", message: "test error", source: "server", createdAt: new Date() },
    ];
    mocks.statsResult = [{ severity: "error", count: 1 }];

    const { GET } = await import("@/app/api/logs/errors/route");

    const response = await GET(new Request("http://localhost/api/logs/errors"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBe(1);
    expect(body.stats.total).toBe(1);
    expect(body.stats.bySeverity.error).toBe(1);
  });

  it("accepts query params", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "DEV" });
    mocks.queryResult = [];
    mocks.statsResult = [];

    const { GET } = await import("@/app/api/logs/errors/route");

    const response = await GET(
      new Request("http://localhost/api/logs/errors?severity=critical&source=server&limit=50&offset=10"),
    );
    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/logs/errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
    mocks.updateSetWhere.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("No session"));

    const { PATCH } = await import("@/app/api/logs/errors/route");

    const response = await PATCH(
      new Request("http://localhost/api/logs/errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [1, 2] }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when non-DEV user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "BMO" });

    const { PATCH } = await import("@/app/api/logs/errors/route");

    const response = await PATCH(
      new Request("http://localhost/api/logs/errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [1, 2] }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("marks errors as resolved for DEV user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "DEV" });

    const { PATCH } = await import("@/app/api/logs/errors/route");

    const response = await PATCH(
      new Request("http://localhost/api/logs/errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [1, 2] }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resolved).toBe(true);
  });

  it("rejects invalid body", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "DEV" });

    const { PATCH } = await import("@/app/api/logs/errors/route");

    const response = await PATCH(
      new Request("http://localhost/api/logs/errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [] }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
