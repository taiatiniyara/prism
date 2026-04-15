import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReviewKpiRowCard } from "@/components/data-entry/review-kpi-row";
import { reviewKpiPageFixture } from "@/test/fixtures/review-kpi";

vi.mock("@/app/data-entry/review-kpi/use-review-kpi-sync", () => ({
  useReviewKpiSync: () => ({ isConnected: true, error: null }),
}));

describe("review kpi row layout", () => {
  it("renders inputs, formula, and result columns", () => {
    const row = reviewKpiPageFixture.rows[0];

    render(
      <ReviewKpiRowCard
        row={row}
        context={reviewKpiPageFixture.context}
      />,
    );

    expect(screen.getByText("Inputs")).toBeInTheDocument();
    expect(screen.getByText("Formula")).toBeInTheDocument();
    expect(screen.getByText("KPI Result")).toBeInTheDocument();

    expect(screen.getByText("Resolved Requests")).toBeInTheDocument();
    expect(screen.getByText("resolved / total")).toBeInTheDocument();
    expect(screen.getByText("0.80")).toBeInTheDocument();
  });
});
