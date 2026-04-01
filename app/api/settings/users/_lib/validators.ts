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
