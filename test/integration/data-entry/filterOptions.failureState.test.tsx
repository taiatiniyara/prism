import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FilterStatePanel } from "@/components/data-entry/filterStatePanel";

describe("filter options failure state", () => {
  it("shows user-visible error message when options loading fails", () => {
    render(
      <FilterStatePanel errorMessage="Failed to load options">
        <div>content</div>
      </FilterStatePanel>,
    );

    expect(
      screen.getByText("Unable to load data-entry content"),
    ).toBeInTheDocument();
    expect(screen.getByText("Failed to load options")).toBeInTheDocument();
  });
});
