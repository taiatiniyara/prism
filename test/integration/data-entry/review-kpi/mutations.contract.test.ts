import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  updateInput: vi.fn(),
  addComment: vi.fn(),
}));

vi.mock("@/lib/user.service", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/app/data-entry/review-kpi/service", () => ({
  updateReviewKpiInputValue: mocks.updateInput,
  addReviewKpiInputComment: mocks.addComment,
}));

describe("review kpi mutation routes contract", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-1", role: "DEV", org_id: 1 });
  });

  it("returns 409 with latest payload for stale input updates", async () => {
    mocks.updateInput.mockRejectedValue(
      Object.assign(new Error("CONFLICT:Input value is stale."), {
        latest: {
          dataEntryId: "5f18315d-b2ee-4fc9-a9f2-430b357f3119",
          inputDefId: 9001,
          inputName: "Resolved Requests",
          value: "93",
          controlType: "number",
          comments: [],
          updatedAt: "2026-03-24T00:00:00.000Z",
          updatedById: "u-2",
        },
      }),
    );

    const { PATCH } = await import(
      "@/app/api/data-entry/review-kpi/inputs/[dataEntryId]/route"
    );

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ value: "95", updatedAt: "2026-03-24T00:00:00.000Z" }),
      }),
      {
        params: Promise.resolve({ dataEntryId: "5f18315d-b2ee-4fc9-a9f2-430b357f3119" }),
      },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.message).toBe("Input value is stale.");
    expect(body.latest.value).toBe("93");
  });

  it("returns 201 for successful comment submission", async () => {
    mocks.addComment.mockResolvedValue({ comments: [] });

    const { POST } = await import(
      "@/app/api/data-entry/review-kpi/inputs/[dataEntryId]/comments/route"
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ comment: "Need evidence for this value" }),
      }),
      {
        params: Promise.resolve({ dataEntryId: "5f18315d-b2ee-4fc9-a9f2-430b357f3119" }),
      },
    );

    expect(response.status).toBe(201);
    expect(mocks.addComment).toHaveBeenCalled();
  });
});
