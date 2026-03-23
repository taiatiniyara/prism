import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewKpiRowCard } from "@/components/data-entry/review-kpi-row";
import { reviewKpiPageFixture } from "@/test/fixtures/review-kpi";

vi.mock("@/app/data-entry/review-kpi/use-review-kpi-sync", () => ({
  useReviewKpiSync: () => ({ isConnected: true, error: null }),
}));

describe("review kpi row mutations", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: "Input value is stale.",
              latest: {
                ...reviewKpiPageFixture.rows[0].inputs[0],
                value: "91",
              },
            }),
            { status: 409 },
          ),
      ),
    );
  });

  it("shows conflict feedback and refreshes stale input value", async () => {
    render(
      <ReviewKpiRowCard
        row={reviewKpiPageFixture.rows[0]}
        context={reviewKpiPageFixture.context}
      />,
    );

    const input = screen.getByDisplayValue("80");
    fireEvent.change(input, { target: { value: "95" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save Resolved Requests" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Input value is stale.")).toBeInTheDocument();
      expect(screen.getByDisplayValue("91")).toBeInTheDocument();
    });
  });
});
