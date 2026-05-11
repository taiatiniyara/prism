import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logRegistrationClarificationInboundReply: vi.fn(),
}));

vi.mock("@/app/settings/users/service", () => ({
  logRegistrationClarificationInboundReply:
    mocks.logRegistrationClarificationInboundReply,
}));

describe("inbound clarification webhook contract", () => {
  beforeEach(() => {
    mocks.logRegistrationClarificationInboundReply.mockReset();
    process.env.EMAIL_INBOUND_WEBHOOK_SECRET = "top-secret";
  });

  it("returns 200 and logged payload for valid webhook", async () => {
    mocks.logRegistrationClarificationInboundReply.mockResolvedValue({
      logged: true,
      userId: "u1",
      messageId: 22,
    });

    const { POST } = await import("@/app/api/webhooks/email/replies/route");

    const response = await POST(
      new Request("http://localhost/api/webhooks/email/replies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-prism-inbound-secret": "top-secret",
        },
        body: JSON.stringify({
          subject: "Subject [PRISM-REF:u1.abc]",
          from: "requester@example.com",
          text: "Reply text",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.logRegistrationClarificationInboundReply).toHaveBeenCalledWith(
      {
        subject: "Subject [PRISM-REF:u1.abc]",
        fromEmail: "requester@example.com",
        message: "Reply text",
        html: undefined,
      },
    );

    const body = await response.json();
    expect(body).toMatchObject({ logged: true, userId: "u1", messageId: 22 });
  });

  it("returns 202 when reply cannot be correlated", async () => {
    mocks.logRegistrationClarificationInboundReply.mockResolvedValue({
      logged: false,
      reason: "missing_reference",
    });

    const { POST } = await import("@/app/api/webhooks/email/replies/route");

    const response = await POST(
      new Request("http://localhost/api/webhooks/email/replies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-prism-inbound-secret": "top-secret",
        },
        body: JSON.stringify({
          subject: "No reference",
          fromEmail: "requester@example.com",
          plain: "Reply",
        }),
      }),
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({ logged: false, reason: "missing_reference" });
  });
});
