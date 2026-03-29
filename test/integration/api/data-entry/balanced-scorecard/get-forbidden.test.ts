import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getScorecardResponse: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/app/data-entry/balanced-scorecard/service", () => ({
  getScorecardResponse: mocks.getScorecardResponse,
}));

describe("balanced scorecard forbidden integration", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "u-2",
      role: "USER",
      role_id: 2,
      org_id: 1,
      email: "user@example.com",
      name: "User",
    });
    mocks.getScorecardResponse.mockRejectedValue(
      new Error("FORBIDDEN:You are not allowed to access scorecard data."),
    );
  });

  it("returns 403 when authenticated role is not authorized", async () => {
    const { GET } =
      await import("@/app/api/data-entry/balanced-scorecard/route");
    const response = await GET(
      new Request(
        "http://localhost/api/data-entry/balanced-scorecard?reportPeriodId=1",
      ),
    );

    expect(response.status).toBe(403);
  });
});
