import { describe, expect, it } from "vitest";

import { getBlockedAccessState } from "@/lib/auth-status-guard";

describe("status gate active integration", () => {
  it("does not block active users", () => {
    const state = getBlockedAccessState("active");
    expect(state.blocked).toBe(false);
    expect(state.status).toBeUndefined();
  });
});
