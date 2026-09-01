import type { UserStatus } from "@/db/schema/auth-schema";

export type BlockedMessage = {
  title: string;
  message: string;
  nextSteps: string;
};

export function getBlockedMessage(
  status: Extract<UserStatus, "pending" | "deactivated">,
  rejectionReason?: string | null,
): BlockedMessage {
  if (status === "deactivated") {
    const reason = rejectionReason?.trim() || "No rejection reason provided.";
    return {
      title: "Access Deactivated",
      message: `Your access has been deactivated. Reason: ${reason}`,
      nextSteps:
        "Please contact your BMO or DEV administrator if you need this decision reviewed.",
    };
  }

  return {
    title: "Registration Pending Approval",
    message:
      "Your registration is pending approval. You can sign in, but you cannot access the app until a BMO or DEV user activates your account.",
    nextSteps:
      "Please wait for activation. If this takes too long, contact your BMO or DEV administrator.",
  };
}
