/**
 * Client-safe types, defaults and validation for the AI performance-report PDF
 * style. Split from pdf-settings.ts (which imports the DB) so the settings form
 * can import the defaults/metadata without pulling the server bundle — same
 * split as source-setting-constants.ts.
 *
 * The DEFAULTS mirror the hardcoded constants that lib/ai/report-pdf.ts shipped
 * with, so an unset/never-configured install renders exactly as before.
 */

export const PDF_REPORT_STYLE_KEY = "pdf_report_style";

export type PdfPageSize = "A4" | "LETTER";

export interface PdfReportStyle {
  /** Body text + headings. */
  ink: string;
  /** Subtle text: the generated-date line, "rows omitted" note. */
  muted: string;
  /** Divider under the header + table row lines. */
  rule: string;
  /** Eyebrow ("PRISM · PPA") + "Insight:" lines. */
  accent: string;
  /** Report title (pt). */
  titleSize: number;
  /** Section heading (pt). */
  headingSize: number;
  /** Body copy + executive summary (pt). */
  bodySize: number;
  /** Table cell text (pt). */
  tableFontSize: number;
  /** Page size. */
  pageSize: PdfPageSize;
  /** Page margin on all sides (pt). */
  margin: number;
}

export const DEFAULT_PDF_REPORT_STYLE: PdfReportStyle = {
  ink: "#111827",
  muted: "#6b7280",
  rule: "#e5e7eb",
  accent: "#1d4ed8",
  titleSize: 20,
  headingSize: 13,
  bodySize: 10,
  tableFontSize: 9,
  pageSize: "A4",
  margin: 50,
};

/** Colour fields, in display order. */
export const PDF_COLOUR_FIELDS: ReadonlyArray<{
  key: "ink" | "muted" | "rule" | "accent";
  label: string;
  help: string;
}> = [
  { key: "ink", label: "Text", help: "Body text and headings." },
  { key: "accent", label: "Accent", help: "The “PRISM · PPA” eyebrow and “Insight:” lines." },
  { key: "muted", label: "Muted text", help: "The generated-date line and subtle notes." },
  { key: "rule", label: "Rules & table lines", help: "Header divider and table row separators." },
];

/** Numeric font-size / margin fields, with sane bounds for the form + server. */
export const PDF_SIZE_FIELDS: ReadonlyArray<{
  key: "titleSize" | "headingSize" | "bodySize" | "tableFontSize" | "margin";
  label: string;
  help: string;
  min: number;
  max: number;
  unit: string;
}> = [
  { key: "titleSize", label: "Title size", help: "The report title.", min: 12, max: 40, unit: "pt" },
  { key: "headingSize", label: "Heading size", help: "Section headings.", min: 9, max: 24, unit: "pt" },
  { key: "bodySize", label: "Body size", help: "Body copy and executive summary.", min: 7, max: 16, unit: "pt" },
  { key: "tableFontSize", label: "Table text size", help: "Table cell text.", min: 6, max: 14, unit: "pt" },
  { key: "margin", label: "Page margin", help: "Margin on all four sides.", min: 24, max: 90, unit: "pt" },
];

export const PDF_PAGE_SIZES: ReadonlyArray<{ value: PdfPageSize; label: string }> = [
  { value: "A4", label: "A4 (210 × 297 mm)" },
  { value: "LETTER", label: "US Letter (8.5 × 11 in)" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const isHex = (v: unknown): v is string => typeof v === "string" && HEX_RE.test(v);

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/**
 * Coerce any stored/submitted value into a valid, safe PdfReportStyle: unknown
 * or malformed fields fall back to the default, colours must be #rrggbb, sizes
 * are clamped to their bounds. Used on both the read path (defensive) and the
 * write path (never persist an out-of-range value).
 */
export function normalizePdfStyle(raw: unknown): PdfReportStyle {
  const d = DEFAULT_PDF_REPORT_STYLE;
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ink: isHex(o.ink) ? o.ink : d.ink,
    muted: isHex(o.muted) ? o.muted : d.muted,
    rule: isHex(o.rule) ? o.rule : d.rule,
    accent: isHex(o.accent) ? o.accent : d.accent,
    titleSize: clampInt(o.titleSize, 12, 40, d.titleSize),
    headingSize: clampInt(o.headingSize, 9, 24, d.headingSize),
    bodySize: clampInt(o.bodySize, 7, 16, d.bodySize),
    tableFontSize: clampInt(o.tableFontSize, 6, 14, d.tableFontSize),
    pageSize: o.pageSize === "LETTER" ? "LETTER" : "A4",
    margin: clampInt(o.margin, 24, 90, d.margin),
  };
}
