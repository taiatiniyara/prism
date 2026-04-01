import { describe, expect, it } from "vitest";

import { assertValidTransition, isBlockedStatus } from "@/lib/user-status";

describe("user status transition rules", () => {
  it("allows pending -> active when decision is activate", () => {
    expect(assertValidTransition("pending", "activate")).toBe("active");
  });

  it("allows pending -> deactivated when decision is reject", () => {
    expect(assertValidTransition("pending", "reject")).toBe("deactivated");
  });

  it("rejects transitions from non-pending statuses", () => {
    expect(() => assertValidTransition("active", "reject")).toThrow(
      "INVALID_TRANSITION",
    );
  });

  it("flags blocked statuses correctly", () => {
    expect(isBlockedStatus("pending")).toBe(true);
    expect(isBlockedStatus("deactivated")).toBe(true);
    expect(isBlockedStatus("active")).toBe(false);
  });
});
