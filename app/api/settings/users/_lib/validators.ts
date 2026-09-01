import type { StatusDecision } from "@/lib/user-status";

export function parseStatusDecisionRequest(body: unknown): {
  decision: StatusDecision;
  rejectionReason?: string;
} {
  if (!body || typeof body !== "object") {
    throw new Error("VALIDATION: request body is required");
  }

  const payload = body as Record<string, unknown>;
  const decision = payload.decision;

  if (decision !== "activate" && decision !== "reject") {
    throw new Error("VALIDATION: decision must be activate or reject");
  }

  const rejectionReason =
    typeof payload.rejectionReason === "string"
      ? payload.rejectionReason.trim()
      : undefined;

  if (decision === "reject" && !rejectionReason) {
    throw new Error("VALIDATION: rejection reason is required");
  }

  return {
    decision,
    rejectionReason,
  };
}

export type ClarificationRequestAction = "send" | "log-response";

export function parseClarificationRequest(body: unknown):
  | {
      action: "send";
      subject: string;
      message: string;
    }
  | {
      action: "log-response";
      subject?: string;
      message: string;
      receivedFromEmail?: string;
    } {
  if (!body || typeof body !== "object") {
    throw new Error("VALIDATION: request body is required");
  }

  const payload = body as Record<string, unknown>;
  const action = payload.action;
  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";
  const subject =
    typeof payload.subject === "string" ? payload.subject.trim() : "";
  const receivedFromEmail =
    typeof payload.receivedFromEmail === "string"
      ? payload.receivedFromEmail.trim()
      : undefined;

  if (action !== "send" && action !== "log-response") {
    throw new Error("VALIDATION: action must be send or log-response");
  }

  if (!message) {
    throw new Error("VALIDATION: message is required");
  }

  if (action === "send") {
    if (!subject) {
      throw new Error("VALIDATION: subject is required");
    }

    return {
      action,
      subject,
      message,
    };
  }

  return {
    action,
    subject: subject || undefined,
    message,
    receivedFromEmail,
  };
}
