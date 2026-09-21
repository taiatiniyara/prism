import { describe, expect, it } from "vitest";
import { safeReportFilename } from "@/lib/ai/report-filename";

describe("safeReportFilename", () => {
  it("keeps a clean title unchanged", () => {
    expect(safeReportFilename("Fleet Performance 2025")).toBe(
      "Fleet_Performance_2025",
    );
  });

  it("collapses disallowed runs to a single underscore", () => {
    expect(safeReportFilename("EFL / TPL: review")).toBe("EFL_TPL_review");
  });

  it("strips leading and trailing separators", () => {
    expect(safeReportFilename("...report---")).toBe("report");
    expect(safeReportFilename("__EFL__")).toBe("EFL");
  });

  it("falls back to 'report' for empty or separator-only input", () => {
    expect(safeReportFilename("")).toBe("report");
    expect(safeReportFilename(undefined)).toBe("report");
    expect(safeReportFilename(null)).toBe("report");
    expect(safeReportFilename("....")).toBe("report");
  });

  it("caps length at 100 characters", () => {
    expect(safeReportFilename("a".repeat(250))).toHaveLength(100);
  });

  it("returns immediately for adversarial separator padding (no ReDoS)", () => {
    // The old /^[._-]+|[._-]+$/g trim on unbounded input backtracked
    // super-linearly; this must complete effectively instantly.
    const evil = ".".repeat(100_000) + "x";
    const started = performance.now();
    const out = safeReportFilename(evil);
    expect(performance.now() - started).toBeLessThan(50);
    expect(out).toBe("x"); // leading dots trimmed, "x" survives
  });
});
