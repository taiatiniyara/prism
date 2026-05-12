import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("legacy fact/dim proxy contract", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PRISM_TRAINING_API_BASE_URL;
    delete process.env.PRISM_TRAINING_MIGRATION_URL;
    delete process.env.NEXT_PUBLIC_PRISM_TRAINING_API_BASE_URL;
    delete process.env.PRISM_TRAINING_API_KEY;
    delete process.env.PRISM_TRAINING_MIGRATION_KEY;
    delete process.env.API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("proxies supported fact endpoints and preserves payload/status", async () => {
    process.env.PRISM_TRAINING_API_BASE_URL = "http://training.local";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('[{"ReportPeriod":"2026-01-01"}]', {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/[legacy]/route");
    const response = await GET(
      new Request("http://localhost/api/factPopulation?limit=10"),
      { params: Promise.resolve({ legacy: "factPopulation" }) },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://training.local/api/factPopulation?limit=10",
      expect.any(Object),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ ReportPeriod: "2026-01-01" }]);
  });

  it("returns 404 for unsupported endpoints", async () => {
    process.env.PRISM_TRAINING_API_BASE_URL = "http://training.local";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/[legacy]/route");
    const response = await GET(new Request("http://localhost/api/notLegacy"), {
      params: Promise.resolve({ legacy: "notLegacy" }),
    });

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when training base URL is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/[legacy]/route");
    const response = await GET(new Request("http://localhost/api/factSafety"), {
      params: Promise.resolve({ legacy: "factSafety" }),
    });

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards auth and migration headers to upstream", async () => {
    process.env.PRISM_TRAINING_API_BASE_URL = "http://training.local";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/[legacy]/route");
    await GET(new Request("http://localhost/api/dimUtilities", {
      headers: {
        Authorization: "token-1",
        "x-migration-key": "mig-1",
      },
    }), {
      params: Promise.resolve({ legacy: "dimUtilities" }),
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    const headers = requestInit?.headers as Headers;

    expect(headers.get("Authorization")).toBe("token-1");
    expect(headers.get("x-migration-key")).toBe("mig-1");
  });
});
