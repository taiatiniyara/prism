import { describe, expect, it } from "vitest";

import { buildCustomKpiReviewOutcomeEmail } from "@/lib/email/email.service";

describe("custom KPI review outcome email payload", () => {
  it("builds approved outcome payload", () => {
    const payload = buildCustomKpiReviewOutcomeEmail({
      title: "Energy Intensity",
      decisionType: "APPROVE",
      rationale: "Clear business case",
    });

    expect(payload.subject).toContain("Approved");
    expect(payload.html).toContain("Energy Intensity");
    expect(payload.html).toContain("Clear business case");
  });

  it("builds replaced outcome payload", () => {
    const payload = buildCustomKpiReviewOutcomeEmail({
      title: "Peak Demand",
      decisionType: "REPLACE",
      rationale: "Equivalent KPI exists",
    });

    expect(payload.subject).toContain("Replaced");
    expect(payload.html).toContain("Equivalent KPI exists");
  });
});
