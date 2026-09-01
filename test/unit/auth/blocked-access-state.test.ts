import { describe, expect, it } from "vitest";

import { getBlockedAccessState } from "@/lib/user-status";
import { getBlockedMessage } from "@/app/auth/blocked/state";

describe("blocked access state", () => {
  it("returns blocked state for pending users", () => {
    const state = getBlockedAccessState("pending");
    expect(state.blocked).toBe(true);
    expect(state.status).toBe("pending");
  });

  it("returns blocked state with rejection reason for deactivated users", () => {
    const state = getBlockedAccessState(
      "deactivated",
      "Invalid access request",
    );
    expect(state.blocked).toBe(true);
    expect(state.status).toBe("deactivated");
    expect(state.rejectionReason).toContain("Invalid");
  });

  it("builds pending and deactivated messages", () => {
    const pending = getBlockedMessage("pending");
    const deactivated = getBlockedMessage("deactivated", "Reason text");

    expect(pending.title).toContain("Pending");
    expect(deactivated.message).toContain("Reason text");
  });
});
