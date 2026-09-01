import type { UserStatus } from "@/db/schema/auth-schema";

export const BLOCKED_STATUSES: ReadonlyArray<UserStatus> = [
  "pending",
  "deactivated",
];

export type BlockedStatus = Extract<UserStatus, "pending" | "deactivated">;

export type StatusDecision = "activate" | "reject";

export function isBlockedStatus(
  status: UserStatus | null | undefined,
): boolean {
  if (!status) {
    return false;
  }
  return BLOCKED_STATUSES.includes(status);
}

export function assertValidTransition(
  fromStatus: UserStatus,
  decision: StatusDecision,
) {
  if (fromStatus !== "pending") {
    throw new Error("INVALID_TRANSITION: only pending users can be decided");
  }

  if (decision === "activate") {
    return "active" as const;
  }

  if (decision === "reject") {
    return "deactivated" as const;
  }

  throw new Error("VALIDATION: unsupported decision type");
}

export function asBlockedStatus(
  status: UserStatus | null | undefined,
): BlockedStatus | null {
  if (!status || !isBlockedStatus(status)) {
    return null;
  }

  return status === "deactivated" ? "deactivated" : "pending";
}

export type BlockedAccessState = {
  blocked: boolean;
  status?: Extract<UserStatus, "pending" | "deactivated">;
  rejectionReason?: string | null;
};

export function getBlockedAccessState(
  status: UserStatus | null | undefined,
  rejectionReason?: string | null,
): BlockedAccessState {
  const blockedStatus = asBlockedStatus(status);

  if (!blockedStatus) {
    return { blocked: false };
  }

  if (blockedStatus === "deactivated") {
    return {
      blocked: true,
      status: blockedStatus,
      rejectionReason: rejectionReason ?? null,
    };
  }

  return {
    blocked: true,
    status: "pending",
  };
}
