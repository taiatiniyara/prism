import type { UserStatus } from "@/db/schema/auth-schema";
import { asBlockedStatus } from "@/lib/user-status";

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
