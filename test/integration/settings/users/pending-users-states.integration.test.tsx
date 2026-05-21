import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import PendingUserDecisionPanel from "@/components/settings/pending-user-decision-panel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pending users panel states integration", () => {
  it("shows loading then empty state", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    } as Response);

    render(<PendingUserDecisionPanel />);

    expect(screen.getByText(/Loading pending users/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.queryByText(/Loading pending users/i),
      ).not.toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network down"));

    render(<PendingUserDecisionPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Network down/i)).toBeInTheDocument();
    });
  });
});
