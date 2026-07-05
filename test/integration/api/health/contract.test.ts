import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  testPowerBiConnection: vi.fn(),
  getCircuitState: vi.fn(),
  createTransport: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/db/connection", () => ({
  db: { execute: mocks.execute },
}));

vi.mock("@/lib/powerbi", () => ({
  testPowerBiConnection: mocks.testPowerBiConnection,
}));

vi.mock("@/lib/ai/service", () => ({
  getCircuitState: mocks.getCircuitState,
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
  createTransport: mocks.createTransport,
}));

describe("GET /api/health contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mocks.fetch;
    mocks.getCircuitState.mockReturnValue({ open: false, remaining: 0 });
    mocks.testPowerBiConnection.mockResolvedValue({
      ok: true,
      datasets_accessible: true,
      message: "OK",
    });
    mocks.execute.mockResolvedValue([{ "?column?": 1 }]);
    mocks.createTransport.mockReturnValue({
      verify: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ page: 1, pages: 1, per_page: "1", total: 1 }]),
    });
  });

  it("returns 200 with all checks passing", async () => {
    const { GET } = await import("@/app/api/health/route");

    const response = await GET(new Request("http://localhost/api/health"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(body.checks).toBeDefined();
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.db.ms).toBeGreaterThanOrEqual(0);
    expect(body.checks.powerbi.ok).toBe(true);
    expect(body.checks.powerbi.datasets_accessible).toBe(true);
    expect(body.checks.ai_models.sonnet.ok).toBe(true);
    expect(body.checks.ai_models.haiku.ok).toBe(true);
    expect(body.checks.smtp.configured).toBe(true);
    expect(body.checks.worldbank.ok).toBe(true);
  });

  it("returns degraded when Power BI is down but DB is up", async () => {
    mocks.testPowerBiConnection.mockResolvedValue({
      ok: false,
      datasets_accessible: false,
      message: "Azure AD rejected credentials (HTTP 401)",
    });

    const { GET } = await import("@/app/api/health/route");

    const response = await GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.db.ok).toBe(true);
    expect(body.checks.powerbi.ok).toBe(false);
  });

  it("returns down when DB fails", async () => {
    mocks.execute.mockRejectedValue(new Error("connection refused"));

    const { GET } = await import("@/app/api/health/route");

    const response = await GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("down");
    expect(body.checks.db.ok).toBe(false);
  });

  it("reports circuit state when circuit is open", async () => {
    mocks.getCircuitState.mockImplementation((model: string) => {
      if (model === "claude-sonnet-4-6") {
        return { open: true, remaining: 25 };
      }
      return { open: false, remaining: 0 };
    });

    const { GET } = await import("@/app/api/health/route");

    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();
    expect(body.checks.ai_models.sonnet.ok).toBe(false);
    expect(body.checks.ai_models.sonnet.circuit_open).toBe(true);
    expect(body.checks.ai_models.sonnet.remaining_seconds).toBe(25);
    expect(body.checks.ai_models.haiku.ok).toBe(true);
  });

  it("reports SMTP as not configured when env vars missing", async () => {
    const prevHost = process.env.SMTP_HOST;
    delete (process.env as Record<string, string>).SMTP_HOST;

    const { GET } = await import("@/app/api/health/route");

    const response = await GET(new Request("http://localhost/api/health"));
    const body = await response.json();
    expect(body.checks.smtp.ok).toBe(false);
    expect(body.checks.smtp.configured).toBe(false);

    process.env.SMTP_HOST = prevHost;
  });

  it("returns 200 even when external services fail", async () => {
    mocks.fetch.mockRejectedValue(new Error("network error"));

    const { GET } = await import("@/app/api/health/route");

    const response = await GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.checks.worldbank.ok).toBe(false);
    expect(body.checks.worldbank.message).toBeDefined();
  });
});
