import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewKpiRowCard } from "@/components/data-entry/review-kpi-row";
import { reviewKpiPageFixture } from "@/test/fixtures/review-kpi";

vi.mock("@/app/data-entry/review-kpi/use-review-kpi-sync", () => ({
  useReviewKpiSync: () => ({ isConnected: true, error: null }),
}));

describe("review kpi async states", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows pending state while saving input value", async () => {
    let resolvePending!: (value: Response) => void;

    const pending = new Promise<Response>((resolve) => {
      resolvePending = resolve;
    });

    vi.stubGlobal("fetch", vi.fn(() => pending));

    render(
      <ReviewKpiRowCard
        row={reviewKpiPageFixture.rows[0]}
        context={reviewKpiPageFixture.context}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("80"), { target: { value: "81" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Resolved Requests" }));

    expect(
      screen.getByRole("button", { name: "Save Resolved Requests" }),
    ).toHaveTextContent("Saving...");

    resolvePending(
      new Response(
        JSON.stringify({
          input: reviewKpiPageFixture.rows[0].inputs[0],
          result: reviewKpiPageFixture.rows[0].result,
        }),
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save Resolved Requests" }),
      ).toHaveTextContent("Save");
    });
  });

  it("shows comment failure state when submission fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: string) => {
        if (request.includes("/comments")) {
          return new Response(
            JSON.stringify({ message: "Comment service unavailable." }),
            { status: 500 },
          );
        }

        return new Response(JSON.stringify({}), { status: 200 });
      }),
    );

    render(
      <ReviewKpiRowCard
        row={reviewKpiPageFixture.rows[0]}
        context={reviewKpiPageFixture.context}
      />,
    );

    const commentInputs = screen.getAllByPlaceholderText("Add a comment");

    fireEvent.change(commentInputs[0], {
      target: { value: "Need verification" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add comment" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Comment service unavailable.")).toBeInTheDocument();
    });
  });
});
