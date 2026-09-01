import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ScorecardDetailPanel from "@/components/data-entry/scorecard-detail-panel";

describe("scorecard detail panel accessibility", () => {
  it("renders selectable guidance when no perspective is chosen", () => {
    render(<ScorecardDetailPanel perspective={null} />);
    expect(
      screen.getByText("Select a perspective to inspect score drivers."),
    ).toBeInTheDocument();
  });
});
