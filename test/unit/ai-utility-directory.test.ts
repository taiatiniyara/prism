import { describe, expect, it } from "vitest";
import {
  UTILITY_DIRECTORY,
  AI_SYSTEM_PROMPT,
  buildSystemPrompt,
} from "@/lib/ai/prompt";

describe("AI utility directory (never infer a utility's country)", () => {
  it("has unique acronyms, ids, and a country for every utility", () => {
    expect(UTILITY_DIRECTORY.length).toBeGreaterThanOrEqual(28);
    const acronyms = UTILITY_DIRECTORY.map((u) => u.acronym);
    expect(new Set(acronyms).size).toBe(acronyms.length);
    const ids = UTILITY_DIRECTORY.map((u) => u.id);
    expect(new Set(ids).size, "duplicate utility_id").toBe(ids.length);
    for (const u of UTILITY_DIRECTORY) {
      expect(Number.isInteger(u.id) && u.id > 0, `id for ${u.acronym}`).toBe(true);
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

  it("pins the utility_ids that were being guessed wrong (TPL=25, TEC=26)", () => {
    expect(UTILITY_DIRECTORY.find((u) => u.acronym === "TPL")?.id).toBe(25);
    expect(UTILITY_DIRECTORY.find((u) => u.acronym === "TEC")?.id).toBe(26);
    // and the prompt gives the model the id + the "never guess an id" rule
    expect(AI_SYSTEM_PROMPT).toContain("utility_id 25 = TPL");
    expect(AI_SYSTEM_PROMPT.toLowerCase()).toContain("never guess or approximate an id");
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
