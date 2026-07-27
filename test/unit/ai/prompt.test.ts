import { describe, expect, it } from "vitest";

import { getSystemPrompt, getPromptVersion } from "@/lib/ai/prompt";

describe("getSystemPrompt", () => {
  it("returns a non-empty string", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toBeTruthy();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(500);
  });

  it("contains core PRISM context", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("PRISM");
    expect(prompt).toContain("Pacific Power Association");
    expect(prompt).toContain("benchmarking");
  });

  it("contains security instructions", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("Never reveal");
    expect(prompt).toContain("ignore");
  });

  it("contains visualization guidelines", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("render_visualization");
    expect(prompt).toContain("table");
    expect(prompt).toContain("bar-chart");
  });

  it("contains PRISM UI routes", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("/data-entry");
    expect(prompt).toContain("/settings");
    expect(prompt).toContain("/prism-ai");
  });

  it("contains tool usage instructions", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toContain("get_benchmarking_data");
    expect(prompt).toContain("get_trend_analysis");
    expect(prompt).toContain("get_kpi_diagnostics");
  });
});

describe("getPromptVersion", () => {
  it("returns a date-based version string", () => {
    const version = getPromptVersion();
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}(-[a-z]+-v\d+)?$/);
  });
});
