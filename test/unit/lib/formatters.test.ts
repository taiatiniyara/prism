import { describe, expect, it } from "vitest";

import { formatReportPeriodDisplay } from "@/lib/formatters";

describe("formatReportPeriodDisplay", () => {
  it("formats monthly report periods as YYYY-MM", () => {
    const value = formatReportPeriodDisplay(
      new Date("2026-05-01T00:00:00.000Z"),
      "Month",
    );

    expect(value).toBe("2026-05");
  });

  it("uses YYYY-MM as default display format", () => {
    const value = formatReportPeriodDisplay(
      new Date("2026-01-31T23:59:59.000Z"),
      null,
    );

    expect(value).toBe("2026-01");
  });

  it("keeps financial year display as YYYY", () => {
    const value = formatReportPeriodDisplay(
      new Date("2026-05-01T00:00:00.000Z"),
      "Financial Year",
    );

    expect(value).toBe("2026");
  });
});
