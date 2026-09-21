import { describe, expect, it } from "vitest";
import {
  UTILITY_DIRECTORY,
  AI_SYSTEM_PROMPT,
  buildSystemPrompt,
} from "@/lib/ai/prompt";

describe("AI utility directory (never infer a utility's country)", () => {
  it("has unique acronyms and a country for every utility", () => {
    expect(UTILITY_DIRECTORY.length).toBeGreaterThanOrEqual(28);
    const acronyms = UTILITY_DIRECTORY.map((u) => u.acronym);
    expect(new Set(acronyms).size).toBe(acronyms.length);
    for (const u of UTILITY_DIRECTORY) {
      expect(u.name.trim(), `name for ${u.acronym}`).not.toBe("");
      expect(u.country.trim(), `country for ${u.acronym}`).not.toBe("");
    }
  });

  it("pins PUB → Kiribati (the reported wrong-country case)", () => {
    const pub = UTILITY_DIRECTORY.find((u) => u.acronym === "PUB");
    expect(pub).toBeDefined();
    expect(pub?.name).toBe("Public Utilities Board");
    expect(pub?.country).toBe("Kiribati");
  });

  it("embeds the directory + the no-infer rule in the system prompt", () => {
    expect(AI_SYSTEM_PROMPT).toContain("PUB — Public Utilities Board (Kiribati)");
    expect(AI_SYSTEM_PROMPT).toContain("Utility Directory");
    expect(AI_SYSTEM_PROMPT.toLowerCase()).toContain(
      "never infer, assume, or state a utility's country",
    );
  });

  it("keeps the directory in the fully-assembled prompt", () => {
    const full = buildSystemPrompt("webapp", "none");
    expect(full).toContain("PUB — Public Utilities Board (Kiribati)");
    expect(full).toContain("EPC — Electric Power Corporation (Samoa)");
  });
});
