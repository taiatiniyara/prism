import { describe, expect, it } from "vitest";

import { inferQueryClassFromPrompt, routeIntent } from "@/lib/ai/intent-router";
import { validateQueryClassContext } from "@/lib/ai/query-class-map";

describe("intent router", () => {
  it("routes known query class to expected service", () => {
    const routed = routeIntent("completeness");
    expect(routed.serviceKey).toBe("completeness-summary");
    expect(routed.requiresReportPeriod).toBe(true);
  });

  it("infers query class from clear prompt", () => {
    expect(inferQueryClassFromPrompt("show stale missing KPI records")).toBe(
      "stale-missing-kpi",
    );
  });

  it("returns ambiguous when prompt matches multiple classes", () => {
    expect(
      inferQueryClassFromPrompt("show pending completeness bottlenecks"),
    ).toBe("AMBIGUOUS");
  });

  it("enforces report period for required classes", () => {
    expect(() =>
      validateQueryClassContext("pending-queue", { serviceAreaId: 9 }),
    ).toThrow("VALIDATION:reportPeriodId is required");

    expect(() =>
      validateQueryClassContext("pending-queue", {
        reportPeriodId: 12,
        serviceAreaId: 9,
      }),
    ).not.toThrow();
  });
});
