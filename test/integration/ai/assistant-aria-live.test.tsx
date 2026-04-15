import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantPanel } from "@/components/ai/assistant-panel";

describe("assistant aria-live announcements", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          traceId: "trace-1",
          summary: "Summary",
          metrics: [],
          rows: [],
          attribution: [],
          export: { pdfAvailable: true, csvAvailable: true },
        }),
      }),
    );
  });

  it("announces loading updates via aria-live region", async () => {
    render(<AssistantPanel />);

    fireEvent.change(screen.getByLabelText("Ask a reporting question"), {
      target: { value: "show completeness" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Run query" }));

    await waitFor(() => {
      expect(screen.getByText("Loading results...")).toBeInTheDocument();
    });
  });
});
