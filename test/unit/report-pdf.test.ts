import { describe, expect, it } from "vitest";
import { renderReportPdf } from "@/lib/ai/report-pdf";

describe("renderReportPdf", () => {
  it("produces a non-empty PDF from an AutomatedReport shape", async () => {
    const pdf = await renderReportPdf({
      title: "EFL Performance Report — FY2023",
      generated_at: "2026-09-21",
      executive_summary: "Energy Fiji Limited performed within regional norms.",
      sections: [
        {
          heading: "1. Utility Overview",
          content: "Performance summary for EFL in FY2023.",
          data_table: {
            columns: ["Metric", "Value"],
            rows: [
              { Metric: "Customers", Value: 180000 },
              { Metric: "Islands", Value: 3 },
              { Metric: "Note, with comma", Value: null },
            ],
          },
        },
        {
          heading: "2. Reliability",
          content: "SAIDI of 420 minutes.",
          insight: "Within acceptable range.",
        },
      ],
    });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(800);
    // PDF magic header
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("handles empty sections without throwing", async () => {
    const pdf = await renderReportPdf({ title: "Empty", sections: [] });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
