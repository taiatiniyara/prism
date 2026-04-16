import { describe, expect, it } from "vitest";

import { inferContextFromPrompt } from "@/lib/ai/query.service";

describe("query context inference", () => {
  it("extracts utility and year from during phrasing", () => {
    const context = inferContextFromPrompt(
      "How much renewable energy was generated for EFL during 2023?",
    );

    expect(context.utilityName).toBe("EFL");
    expect(context.year).toBe(2023);
  });

  it("extracts year from FY tokens", () => {
    const context = inferContextFromPrompt(
      "Show renewable generation by Energy Fiji Limited in FY2023",
    );

    expect(context.utilityName).toBe("Energy Fiji Limited");
    expect(context.year).toBe(2023);
  });

  it("extracts explicit report period and service area ids", () => {
    const context = inferContextFromPrompt(
      "show status for report period 42 service area 7",
    );

    expect(context.reportPeriodId).toBe(42);
    expect(context.serviceAreaId).toBe(7);
  });
});
