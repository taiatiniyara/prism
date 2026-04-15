import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  runAiQuery: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/ai/query.service", () => ({
  runAiQuery: mocks.runAiQuery,
}));

describe("POST /api/ai/query success", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.runAiQuery.mockReset();
  });

  it("returns 200 and structured response envelope", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-1",
      role: "DEV",
      name: "Developer",
      email: "dev@example.com",
      role_id: 1,
      org_id: 1,
      status: "active",
      reject_reason: null,
    });

    mocks.runAiQuery.mockResolvedValue({
      traceId: "trace-1",
      summary: "Summary",
      metrics: [{ label: "Rows returned", value: 1 }],
      rows: [{ queryClass: "completeness" }],
      attribution: [
        {
          sourceName: "completeness-summary",
          sourceType: "SERVICE_FUNCTION",
          sourceRef: "lib/ai/allowed-read-services.ts",
        },
      ],
      export: {
        pdfAvailable: true,
        csvAvailable: true,
        reportId: "trace-1",
      },
    });

    const { POST } = await import("@/app/api/ai/query/route");

    const response = await POST(
      new Request("http://localhost/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "show completeness",
          queryClass: "completeness",
          filterContext: { reportPeriodId: 1 },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      traceId: "trace-1",
      summary: "Summary",
    });
    expect(Array.isArray(body.metrics)).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(Array.isArray(body.attribution)).toBe(true);
    expect(body.export).toMatchObject({
      pdfAvailable: true,
      csvAvailable: true,
    });
  });
});
