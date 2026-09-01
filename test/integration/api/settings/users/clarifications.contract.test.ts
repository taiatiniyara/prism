import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  listRegistrationClarificationMessages: vi.fn(),
  sendRegistrationClarificationMessage: vi.fn(),
  logRegistrationClarificationResponse: vi.fn(),
}));

vi.mock("@/app/settings/users/service", () => ({
  listRegistrationClarificationMessages:
    mocks.listRegistrationClarificationMessages,
  sendRegistrationClarificationMessage:
    mocks.sendRegistrationClarificationMessage,
  logRegistrationClarificationResponse:
    mocks.logRegistrationClarificationResponse,
}));

describe("registration clarifications contract", () => {
  beforeEach(() => {
    mocks.listRegistrationClarificationMessages.mockReset();
    mocks.sendRegistrationClarificationMessage.mockReset();
    mocks.logRegistrationClarificationResponse.mockReset();
  });

  it("returns 200 and items payload for GET", async () => {
    mocks.listRegistrationClarificationMessages.mockResolvedValue([
      {
        id: 1,
        userId: "u1",
        actorUserId: "admin-1",
        actorName: "Admin",
        actorEmail: "admin@example.com",
        direction: "outbound",
        subject: "Need details",
        message: "Please provide more details.",
        receivedFromEmail: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const { GET } =
      await import("@/app/api/settings/users/[userId]/clarifications/route");

    const response = await GET(
      new Request("http://localhost/api/settings/users/u1/clarifications"),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0]).toMatchObject({
      id: 1,
      userId: "u1",
      direction: "outbound",
    });
  });

  it("routes send action to service", async () => {
    mocks.sendRegistrationClarificationMessage.mockResolvedValue({
      id: 2,
      userId: "u1",
      direction: "outbound",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const { POST } =
      await import("@/app/api/settings/users/[userId]/clarifications/route");

    const response = await POST(
      new Request("http://localhost/api/settings/users/u1/clarifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          subject: "Need clarification",
          message: "Please confirm dataset scope.",
        }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.sendRegistrationClarificationMessage).toHaveBeenCalledWith({
      userId: "u1",
      subject: "Need clarification",
      message: "Please confirm dataset scope.",
    });
  });

  it("routes log-response action to service", async () => {
    mocks.logRegistrationClarificationResponse.mockResolvedValue({
      id: 3,
      userId: "u1",
      direction: "inbound",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const { POST } =
      await import("@/app/api/settings/users/[userId]/clarifications/route");

    const response = await POST(
      new Request("http://localhost/api/settings/users/u1/clarifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log-response",
          subject: "Re: Clarification",
          message: "Here are the requested details.",
          receivedFromEmail: "requester@example.com",
        }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.logRegistrationClarificationResponse).toHaveBeenCalledWith({
      userId: "u1",
      subject: "Re: Clarification",
      message: "Here are the requested details.",
      receivedFromEmail: "requester@example.com",
    });
  });
});
