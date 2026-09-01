import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AggregatedProcessingStatus } from "@/components/data-entry/aggregated-processing-status";

describe("kpi status accessibility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("supports keyboard-readable status announcements and readable errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "attempt-1",
          status: "failed",
          retryCount: 1,
          failureReason: "Calculation failed due to missing input",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: null,
        },
      ],
    } as Response);

    render(
      React.createElement(AggregatedProcessingStatus, {
        reportPeriodId: 1,
        serviceAreaId: null,
        mode: "kpi",
      }),
    );

    const card = await screen.findByText("KPI Calculation Processing");
    expect(card.closest("[aria-live='polite']")).not.toBeNull();

    await waitFor(() => {
      expect(
        screen.getByText("Calculation failed due to missing input"),
      ).toBeInTheDocument();
    });
  });
});
