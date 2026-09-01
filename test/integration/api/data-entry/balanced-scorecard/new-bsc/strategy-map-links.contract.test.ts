import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the auth boundary and the service; the route's real validator still runs,
// so this exercises payload parsing + the VALIDATION/FORBIDDEN/401 error mapping
// (spec §13.4 rules surface as VALIDATION errors from the service).
const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  addObjectiveLink: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/balanced-scorecard/new-bsc/strategy-map.service", () => ({
  addObjectiveLink: mocks.addObjectiveLink,
}));

import { POST } from "@/app/api/data-entry/balanced-scorecard/new-bsc/strategy-map/links/route";

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/data-entry/balanced-scorecard/new-bsc/strategy-map/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const validBody = { sourceNodeId: "n-src", targetNodeId: "n-tgt", relation: "drives" };

describe("POST /strategy-map/links contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", role: "BLO" });
    mocks.addObjectiveLink.mockResolvedValue({ id: "link-1", warning: null });
  });

  it("returns 401 when the user is not authenticated", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("no session"));
    const res = await post(validBody);
    expect(res.status).toBe(401);
    expect(mocks.addObjectiveLink).not.toHaveBeenCalled();
  });

  it("returns 201 with the created link and a null warning on the happy path", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: "link-1", warning: null });
    expect(mocks.addObjectiveLink).toHaveBeenCalledWith(
      { id: "u-1", role: "BLO" },
      { sourceNodeId: "n-src", targetNodeId: "n-tgt", relation: "drives", note: null },
    );
  });

  it("passes a cycle warning straight through (spec §13.4 warn-but-allow)", async () => {
    mocks.addObjectiveLink.mockResolvedValue({
      id: "link-2",
      warning: "This link closes a cause-effect cycle. Strategy maps are usually acyclic — added anyway.",
    });
    const res = await post(validBody);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.warning).toMatch(/closes a cause-effect cycle/);
  });

  it("returns 400 when the payload fails validation (before reaching the service)", async () => {
    const res = await post({ targetNodeId: "n-tgt" }); // missing sourceNodeId
    expect(res.status).toBe(400);
    expect(mocks.addObjectiveLink).not.toHaveBeenCalled();
  });

  it("maps a service VALIDATION error (e.g. self-loop / non-map-node) to 400", async () => {
    mocks.addObjectiveLink.mockRejectedValue(
      new Error("VALIDATION:A link's source and target must differ."),
    );
    const res = await post(validBody);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      message: "A link's source and target must differ.",
    });
  });

  it("maps a service FORBIDDEN error to 403", async () => {
    mocks.addObjectiveLink.mockRejectedValue(
      new Error("FORBIDDEN:You are not allowed to build this scorecard."),
    );
    const res = await post(validBody);
    expect(res.status).toBe(403);
  });
});
