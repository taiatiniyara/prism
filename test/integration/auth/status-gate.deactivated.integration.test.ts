import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";

import { getBlockedAccessState } from "@/lib/auth-status-guard";
import BlockedAccessOverlay from "@/components/auth/blocked-access-overlay";

describe("status gate deactivated integration", () => {
  it("marks deactivated users as blocked and shows rejection reason", () => {
    const reason = "Insufficient profile details";
    const state = getBlockedAccessState("deactivated", reason);

    expect(state.blocked).toBe(true);
    expect(state.status).toBe("deactivated");

    render(
      createElement(BlockedAccessOverlay, {
        status: "deactivated",
        rejectionReason: reason,
      }),
    );

    expect(screen.getByText(/Access Deactivated/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(reason, "i"))).toBeInTheDocument();
  });
});
