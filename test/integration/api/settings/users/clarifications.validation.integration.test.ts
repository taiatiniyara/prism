import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("registration clarifications validation", () => {
  beforeEach(() => {
    mocks.listRegistrationClarificationMessages.mockReset();
    mocks.sendRegistrationClarificationMessage.mockReset();
    mocks.logRegistrationClarificationResponse.mockReset();
  });

  it("returns 400 for invalid action payload", async () => {
    const { POST } =
      await import("@/app/api/settings/users/[userId]/clarifications/route");

    const response = await POST(
      new Request("http://localhost/api/settings/users/u1/clarifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unsupported", message: "test" }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.sendRegistrationClarificationMessage).not.toHaveBeenCalled();
    expect(mocks.logRegistrationClarificationResponse).not.toHaveBeenCalled();
  });

  it("returns 403 when GET service reports forbidden", async () => {
    mocks.listRegistrationClarificationMessages.mockRejectedValue(
      new Error("FORBIDDEN: only BMO/DEV users can perform this action"),
    );

    const { GET } =
      await import("@/app/api/settings/users/[userId]/clarifications/route");

    const response = await GET(
      new Request("http://localhost/api/settings/users/u1/clarifications"),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(403);
  });

  it("returns 409 when send action is not allowed", async () => {
    mocks.sendRegistrationClarificationMessage.mockRejectedValue(
      new Error(
        "INVALID_TRANSITION: clarification can only be sent for pending users",
      ),
    );

    const { POST } =
      await import("@/app/api/settings/users/[userId]/clarifications/route");

    const response = await POST(
      new Request("http://localhost/api/settings/users/u1/clarifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          subject: "Need clarification",
          message: "Please provide details",
        }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(409);
  });

  it("returns 503 when storage setup is missing", async () => {
    mocks.listRegistrationClarificationMessages.mockRejectedValue(
      new Error(
        "SETUP: clarification storage is not available yet. Run database migration 0024.",
      ),
    );

    const { GET } =
      await import("@/app/api/settings/users/[userId]/clarifications/route");

    const response = await GET(
      new Request("http://localhost/api/settings/users/u1/clarifications"),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(503);
  });

  it("returns 502 when email delivery fails", async () => {
    mocks.sendRegistrationClarificationMessage.mockRejectedValue(
      new Error("EMAIL: SMTP configuration is incomplete."),
    );

    const { POST } =
      await import("@/app/api/settings/users/[userId]/clarifications/route");

    const response = await POST(
      new Request("http://localhost/api/settings/users/u1/clarifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          subject: "Need clarification",
          message: "Please provide details",
        }),
      }),
      { params: Promise.resolve({ userId: "u1" }) },
    );

    expect(response.status).toBe(502);
  });
});
