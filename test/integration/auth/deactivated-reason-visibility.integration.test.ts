import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";

import BlockedAccessOverlay from "@/components/auth/blocked-access-overlay";

describe("deactivated reason visibility integration", () => {
  it("shows persisted rejection reason to deactivated user", () => {
    render(
      createElement(BlockedAccessOverlay, {
        status: "deactivated",
        rejectionReason: "Registration details were insufficient",
      }),
    );

    expect(screen.getByText(/Access Deactivated/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Registration details were insufficient/i),
    ).toBeInTheDocument();
  });
});
