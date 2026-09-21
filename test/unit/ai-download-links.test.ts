import { describe, expect, it } from "vitest";
import { AI_SYSTEM_PROMPT, buildSystemPrompt } from "@/lib/ai/prompt";

describe("AI downloads rule", () => {
  it("leads with the positive capability and forbids fabricated links", () => {
    for (const prompt of [AI_SYSTEM_PROMPT, buildSystemPrompt("webapp", "none")]) {
      expect(prompt).toContain("Downloads & Files");
      // must NOT let the model claim PDF/export is impossible
      expect(prompt).toMatch(/can give the user downloadable files/i);
      expect(prompt).toMatch(/never tell the user that export\/download\/pdf is unavailable/i);
      // the report → Download PDF path
      expect(prompt).toContain("Download PDF");
      expect(prompt).toContain('"type":"report"');
      // and still forbids inventing a link
      expect(prompt).toMatch(/fabricate a download url\/link/i);
    }
  });
});
