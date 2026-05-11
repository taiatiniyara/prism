import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logRegistrationClarificationInboundReply: vi.fn(),
}));

vi.mock("@/app/settings/users/service", () => ({
  logRegistrationClarificationInboundReply:
    mocks.logRegistrationClarificationInboundReply,
}));

describe("inbound clarification webhook validation", () => {
  beforeEach(() => {
    mocks.logRegistrationClarificationInboundReply.mockReset();
    process.env.EMAIL_INBOUND_WEBHOOK_SECRET = "top-secret";
  });

  it("returns 403 when webhook secret is invalid", async () => {
    const { POST } = await import("@/app/api/webhooks/email/replies/route");

    const response = await POST(
      new Request("http://localhost/api/webhooks/email/replies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-prism-inbound-secret": "wrong-secret",
        },
        body: JSON.stringify({ subject: "hi" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(
      mocks.logRegistrationClarificationInboundReply,
    ).not.toHaveBeenCalled();
  });

  it("returns 503 when webhook secret is not configured", async () => {
    delete process.env.EMAIL_INBOUND_WEBHOOK_SECRET;
    const { POST } = await import("@/app/api/webhooks/email/replies/route");

    const response = await POST(
      new Request("http://localhost/api/webhooks/email/replies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-prism-inbound-secret": "top-secret",
        },
        body: JSON.stringify({ subject: "hi" }),
      }),
    );

    expect(response.status).toBe(503);
  });

  it("returns 400 for validation errors from service", async () => {
    mocks.logRegistrationClarificationInboundReply.mockRejectedValue(
      new Error("VALIDATION: message is required"),
    );

    const { POST } = await import("@/app/api/webhooks/email/replies/route");

    const response = await POST(
      new Request("http://localhost/api/webhooks/email/replies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-prism-inbound-secret": "top-secret",
        },
        body: JSON.stringify({
          subject: "Subject",
          from: "user@example.com",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
