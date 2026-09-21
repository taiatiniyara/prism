import { describe, expect, it } from "vitest";
import { sanitizeForPdf } from "@/lib/ai/report-pdf";

// The AI emits RAG status emoji (✅ ⚠️ 🔴 …) in report cells and prose. pdfkit's
// built-in Helvetica (WinAnsi) and typical brand .ttf uploads have no glyph for
// them, so unsanitized they print as blank .notdef boxes. sanitizeForPdf maps
// the known ones to words and strips any other non-Latin-1 codepoint.
describe("sanitizeForPdf", () => {
  it("maps green/✅ status to 'On track'", () => {
    expect(sanitizeForPdf("✅")).toBe("On track");
    expect(sanitizeForPdf("🟢")).toBe("On track");
  });

  it("maps amber/⚠️ status to 'At risk'", () => {
    expect(sanitizeForPdf("⚠️")).toBe("At risk");
    expect(sanitizeForPdf("🟡")).toBe("At risk");
    expect(sanitizeForPdf("🟠")).toBe("At risk");
  });

  it("maps red/🔴 status to 'Off track'", () => {
    expect(sanitizeForPdf("🔴")).toBe("Off track");
  });

  it("substitutes emoji embedded in a longer string", () => {
    expect(sanitizeForPdf("Status ✅")).toBe("Status On track");
    expect(sanitizeForPdf("Some 🟢 utilities")).toBe("Some On track utilities");
  });

  it("leaves plain ASCII and Latin-1 text untouched", () => {
    expect(sanitizeForPdf("Plain ASCII text")).toBe("Plain ASCII text");
    expect(sanitizeForPdf("café résumé")).toBe("café résumé");
  });

  it("strips unknown emoji rather than rendering a .notdef box, collapsing the gap", () => {
    expect(sanitizeForPdf("weird 🚀 rocket")).toBe("weird rocket");
    expect(sanitizeForPdf("trailing 🎉")).toBe("trailing");
  });
});
