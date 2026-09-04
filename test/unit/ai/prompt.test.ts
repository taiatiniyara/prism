import { describe, expect, it } from "vitest";

import { buildSystemPrompt, getPromptVersion } from "@/lib/ai/prompt";

// Content checks use the synchronous builder (no DB) with the default primary.
const prompt = buildSystemPrompt("powerbi");

describe("buildSystemPrompt", () => {
  it("returns a non-empty string", () => {
    expect(prompt).toBeTruthy();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(500);
  });

  it("contains core PRISM context", () => {
    expect(prompt).toContain("PRISM");
    expect(prompt).toContain("Pacific Power Association");
    expect(prompt).toContain("benchmarking");
  });

  it("contains security instructions", () => {
    expect(prompt).toContain("Never reveal");
    expect(prompt).toContain("ignore");
  });

  it("contains visualization guidelines", () => {
    expect(prompt).toContain("render_visualization");
    expect(prompt).toContain("table");
    expect(prompt).toContain("bar-chart");
  });

  it("contains PRISM UI routes", () => {
    expect(prompt).toContain("/data-entry");
    expect(prompt).toContain("/settings");
    expect(prompt).toContain("/prism-ai");
  });

  it("contains tool usage instructions", () => {
    expect(prompt).toContain("get_benchmarking_data");
    expect(prompt).toContain("get_trend_analysis");
    expect(prompt).toContain("get_kpi_diagnostics");
  });

  it("resolves the token (no placeholder leaks into the final prompt)", () => {
    expect(prompt).not.toContain("{{DATA_SOURCE_POLICY}}");
    expect(buildSystemPrompt("webapp")).not.toContain("{{DATA_SOURCE_POLICY}}");
  });
});

describe("data source policy flips with the primary source", () => {
  const powerbiPrompt = buildSystemPrompt("powerbi");
  const webappPrompt = buildSystemPrompt("webapp");

  it("Power BI primary → Power BI is PRIMARY, gold layer SECONDARY", () => {
    expect(powerbiPrompt).toContain("**Power BI** is your PRIMARY source");
    expect(powerbiPrompt).toContain("Try Power BI first");
  });

  it("WebApp primary → gold layer is PRIMARY, Power BI SECONDARY", () => {
    expect(webappPrompt).toContain(
      "**PRISM web app gold layer** is your PRIMARY source",
    );
    expect(webappPrompt).toContain("Try the gold layer first");
    expect(webappPrompt).toContain("Power BI is the SECONDARY source");
  });

  it("the two prompts differ only where the policy lives", () => {
    expect(powerbiPrompt).not.toEqual(webappPrompt);
  });
});

describe("isolation mode (secondary = none)", () => {
  it("WebApp only → gold layer only, Power BI disabled", () => {
    const p = buildSystemPrompt("webapp", "none");
    expect(p).toContain("Use ONLY the **PRISM web app gold layer**");
    expect(p).toContain("Power BI is DISABLED");
    expect(p).toContain("there is no fallback source");
    expect(p).not.toContain("{{DATA_SOURCE_POLICY}}");
  });

  it("Power BI only → Power BI only, gold layer disabled", () => {
    const p = buildSystemPrompt("powerbi", "none");
    expect(p).toContain("Use ONLY **Power BI**");
    expect(p).toContain("gold-layer tools are DISABLED");
    expect(p).toContain("there is no fallback source");
  });

  it("isolation differs from the two-tier policy", () => {
    expect(buildSystemPrompt("webapp", "none")).not.toEqual(
      buildSystemPrompt("webapp", "powerbi"),
    );
  });
});

describe("getPromptVersion", () => {
  it("returns a date-based version string", () => {
    const version = getPromptVersion();
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}(-[a-z]+-v\d+)?$/);
  });
});
