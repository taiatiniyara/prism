import { describe, expect, it } from "vitest";

import { canPromoteCustomKpiVisibility } from "@/app/data-entry/review-kpi/service";

describe("custom KPI promotion transition", () => {
  it("allows approved submitter-only request promotion", () => {
    expect(canPromoteCustomKpiVisibility("APPROVED", "SUBMITTER_ONLY")).toBe(
      true,
    );
  });

  it("blocks non-approved statuses", () => {
    expect(
      canPromoteCustomKpiVisibility("PENDING_REVIEW", "SUBMITTER_ONLY"),
    ).toBe(false);
    expect(canPromoteCustomKpiVisibility("REJECTED", "SUBMITTER_ONLY")).toBe(
      false,
    );
  });

  it("blocks already-global requests", () => {
    expect(canPromoteCustomKpiVisibility("APPROVED", "GLOBAL")).toBe(false);
  });
});
