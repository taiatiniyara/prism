import { timingSafeEqual } from "node:crypto";
import { logRegistrationClarificationInboundReply } from "@/app/settings/users/service";

type InboundWebhookBody = {
  subject?: unknown;
  from?: unknown;
  sender?: unknown;
  fromEmail?: unknown;
  text?: unknown;
  html?: unknown;
  plain?: unknown;
  [key: string]: unknown;
};

const getString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value.trim() : undefined;
};

const normalizeInboundPayload = (payload: InboundWebhookBody) => {
  const mailgunStrippedText = getString(payload["stripped-text"]);
  const subject = getString(payload.subject);
  const fromEmail =
    getString(payload.fromEmail) ||
    getString(payload.from) ||
    getString(payload.sender);
  const message =
    getString(payload.text) || getString(payload.plain) || mailgunStrippedText;
  const html = getString(payload.html);

  return {
    subject,
    fromEmail,
    message,
    html,
  };
};

const getConfiguredWebhookSecret = (): string => {
  return process.env.EMAIL_INBOUND_WEBHOOK_SECRET?.trim() || "";
};

export async function POST(request: Request) {
  const configuredSecret = getConfiguredWebhookSecret();

  if (!configuredSecret) {
    return Response.json(
      {
        message:
          "Inbound email webhook is not configured. Set EMAIL_INBOUND_WEBHOOK_SECRET.",
      },
      { status: 503 },
    );
  }

  const providedSecret =
    request.headers.get("x-prism-inbound-secret")?.trim() ||
    request.headers.get("x-webhook-secret")?.trim() ||
    "";

  if (providedSecret.length !== configuredSecret.length ||
      !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(configuredSecret))) {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const json = (await request.json()) as InboundWebhookBody;
    const normalized = normalizeInboundPayload(json || {});

    const result = await logRegistrationClarificationInboundReply(normalized);

    if (!result.logged) {
      return Response.json(
        {
          logged: false,
          reason: result.reason,
        },
        { status: 202 },
      );
    }

    return Response.json({
      logged: true,
      userId: result.userId,
      messageId: result.messageId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("VALIDATION:")) {
      return Response.json(
        { message: message.replace("VALIDATION:", "").trim() },
        { status: 400 },
      );
    }

    if (message.startsWith("SETUP:")) {
      return Response.json(
        { message: message.replace("SETUP:", "").trim() },
        { status: 503 },
      );
    }

    return Response.json(
      { message: "Unable to process inbound clarification reply." },
      { status: 500 },
    );
  }
}
