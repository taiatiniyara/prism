import { describe, expect, it } from "vitest";
import { AI_SYSTEM_PROMPT, buildSystemPrompt } from "@/lib/ai/prompt";

describe("AI downloads rule (no fabricated links)", () => {
  it("forbids fabricated download links and points to the visualization Download buttons", () => {
    for (const prompt of [AI_SYSTEM_PROMPT, buildSystemPrompt("webapp", "none")]) {
      expect(prompt).toContain("Downloads & Files");
      expect(prompt).toMatch(/never invent, promise, or output a download url\/link/i);
      expect(prompt.toLowerCase()).toContain("download buttons");
    }
  });
});
