import { describe, expect, it } from "vitest";

import { getBlockedAccessState } from "@/lib/auth-status-guard";
import { getBlockedMessage } from "@/app/auth/blocked/state";

describe("status gate pending integration", () => {
  it("marks pending users as blocked with pending guidance", () => {
    const state = getBlockedAccessState("pending");
    const message = getBlockedMessage("pending");

    expect(state.blocked).toBe(true);
    expect(state.status).toBe("pending");
    expect(message.title).toContain("Pending");
    expect(message.message).toContain("cannot access the app");
  });
});
