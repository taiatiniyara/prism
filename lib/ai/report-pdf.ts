import PDFDocument from "pdfkit";
import {
  DEFAULT_PDF_REPORT_STYLE,
  type PdfReportStyle,
} from "./pdf-settings-constants";
import type { PdfFontBuffers } from "./pdf-settings";

/**
 * Server-side PDF generation for the AI performance report (the shape returned
 * by generatePerformanceReport → AutomatedReport). Declared in next.config
 * `serverExternalPackages` so pdfkit loads from node_modules at runtime.
 *
 * Style (colours, type sizes, page size + margin) comes from a `PdfReportStyle`,
 * and an optional `PdfFontBuffers` supplies a custom brand font — both DEV/BMO
 * configurable in AI Settings, persisted in app_settings. With neither argument
 * the report renders byte-identically to the original (Helvetica, default look).
 */

export interface ReportPdfSection {
  heading: string;
  content: string;
  insight?: string;
  data_table?: { columns: string[]; rows: Record<string, unknown>[] };
}

export interface ReportPdfInput {
  title: string;
  generated_at?: string;
  executive_summary?: string;
  sections: ReportPdfSection[];
}

/** The three resolved face names used across the document. */
interface Faces {
  base: string;
  bold: string;
  italic: string;
}

const MAX_TABLE_ROWS = 200;

// RAG status emoji the AI emits in report cells/prose have no glyph in
// pdfkit's built-in Helvetica (WinAnsi/cp1252) nor in typical brand .ttf
// uploads, so they render as blank .notdef boxes. Map the known ones to plain
// words, then strip any remaining non-Latin-1 codepoint so nothing prints as an
// empty box. Applied to every model-authored string before it reaches doc.text.
const STATUS_GLYPHS: Record<string, string> = {
  "✅": "On track",
  "🟢": "On track",
  "⚠️": "At risk",
  "🟡": "At risk",
  "🔴": "Off track",
  "🟠": "At risk",
};

export const sanitizeForPdf = (value: string): string => {
  let out = value;
  for (const [emoji, word] of Object.entries(STATUS_GLYPHS)) {
    if (out.includes(emoji)) out = out.split(emoji).join(word);
  }
  return out
    .replace(/[^\x00-\xFF]/g, "") // drop anything the font can't draw
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

const cell = (value: unknown): string =>
  value === null || value === undefined ? "" : sanitizeForPdf(String(value));

export async function renderReportPdf(
  report: ReportPdfInput,
  style: PdfReportStyle = DEFAULT_PDF_REPORT_STYLE,
  fonts?: PdfFontBuffers,
): Promise<Buffer> {
  const INK = style.ink;
  const MUTED = style.muted;
  const RULE = style.rule;
  const ACCENT = style.accent;

  const doc = new PDFDocument({
    size: style.pageSize,
    margin: style.margin,
    bufferPages: true,
    info: { Title: report.title || "PRISM Report" },
  });

  // A custom brand font applies only when a Regular face is present; Bold/Italic
  // fall back to Regular. Otherwise we use pdfkit's built-in Helvetica faces —
  // so an unset font renders exactly as before.
  const faces: Faces = { base: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" };
  if (fonts?.regular) {
    // A font can pass magic-byte validation yet still be corrupt/unsupported.
    // pdfkit registers eagerly but fontkit PARSES LAZILY on first use — so a
    // truncated font wouldn't throw at registerFont, it'd throw at the first
    // real .font("Brand") call and 500 every report. Probe each face here,
    // inside the guard, to force parsing now; on failure keep Helvetica.
    try {
      doc.registerFont("Brand", fonts.regular);
      doc.registerFont("Brand-Bold", fonts.bold ?? fonts.regular);
      doc.registerFont("Brand-Italic", fonts.italic ?? fonts.regular);
      doc.font("Brand");
      doc.font("Brand-Bold");
      doc.font("Brand-Italic");
      faces.base = "Brand";
      faces.bold = "Brand-Bold";
      faces.italic = "Brand-Italic";
    } catch {
      faces.base = "Helvetica";
      faces.bold = "Helvetica-Bold";
      faces.italic = "Helvetica-Oblique";
    }
  }

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const left = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;

  // ── Header ───────────────────────────────────────────────
  doc
    .font(faces.bold)
    .fontSize(9)
    .fillColor(ACCENT)
    .text("PRISM · Pacific Power Association", left, doc.y);
  doc
    .font(faces.bold)
    .fontSize(style.titleSize)
    .fillColor(INK)
    .text(sanitizeForPdf(report.title || "Performance Report"), {
      width: usableWidth,
    });
  doc
    .font(faces.base)
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      `Generated ${report.generated_at || new Date().toISOString().slice(0, 10)}`,
    );
  doc.moveDown(0.4);
  doc
    .moveTo(left, doc.y)
    .lineTo(left + usableWidth, doc.y)
    .lineWidth(1)
    .strokeColor(RULE)
    .stroke();
  doc.moveDown(0.8);

  // ── Executive summary ────────────────────────────────────
  if (report.executive_summary) {
    // Original hierarchy: the exec-summary heading sat 1pt below section
    // headings (12 vs 13). Keep that relationship so an unset style renders
    // byte-identically, while still tracking the configurable heading size.
    doc
      .font(faces.bold)
      .fontSize(style.headingSize - 1)
      .fillColor(INK)
      .text("Executive Summary");
    doc.moveDown(0.2);
    doc
      .font(faces.base)
      .fontSize(style.bodySize)
      .fillColor(INK)
      .text(sanitizeForPdf(report.executive_summary), { width: usableWidth });
    doc.moveDown(0.8);
  }

  // ── Sections ─────────────────────────────────────────────
  for (const section of report.sections ?? []) {
    if (doc.y + 60 > bottom) doc.addPage();

    doc
      .font(faces.bold)
      .fontSize(style.headingSize)
      .fillColor(INK)
      .text(sanitizeForPdf(section.heading || ""), { width: usableWidth });
    doc.moveDown(0.2);

    if (section.content) {
      doc
        .font(faces.base)
        .fontSize(style.bodySize)
        .fillColor(INK)
        .text(sanitizeForPdf(section.content), { width: usableWidth });
      doc.moveDown(0.3);
    }

    if (section.data_table?.columns?.length) {
      drawTable(
        doc,
        left,
        usableWidth,
        bottom,
        section.data_table.columns,
        section.data_table.rows ?? [],
        style,
        faces,
      );
      doc.moveDown(0.3);
    }

    if (section.insight) {
      doc
        .font(faces.italic)
        .fontSize(style.bodySize)
        .fillColor(ACCENT)
        .text(`Insight: ${sanitizeForPdf(section.insight)}`, {
          width: usableWidth,
        });
    }
    doc.moveDown(0.8);
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}

function drawTable(
  doc: PDFKit.PDFDocument,
  left: number,
  usableWidth: number,
  bottom: number,
  columns: string[],
  rows: Record<string, unknown>[],
  style: PdfReportStyle,
  faces: Faces,
): void {
  const colWidth = usableWidth / columns.length;
  const rowHeight = 18;

  const drawRow = (values: string[], header: boolean) => {
    if (doc.y + rowHeight > bottom) doc.addPage();
    const y = doc.y;
    doc
      .font(header ? faces.bold : faces.base)
      .fontSize(style.tableFontSize)
      .fillColor(header ? style.ink : "#374151");
    values.forEach((value, i) => {
      doc.text(value, left + i * colWidth + 2, y + 4, {
        width: colWidth - 4,
        height: rowHeight,
        ellipsis: true,
        lineBreak: false,
      });
    });
    doc
      .moveTo(left, y + rowHeight)
      .lineTo(left + usableWidth, y + rowHeight)
      .lineWidth(0.5)
      .strokeColor(style.rule)
      .stroke();
    doc.x = left;
    doc.y = y + rowHeight;
  };

  drawRow(columns.map(sanitizeForPdf), true);
  for (const row of rows.slice(0, MAX_TABLE_ROWS)) {
    drawRow(
      columns.map((col) => cell(row[col])),
      false,
    );
  }
  if (rows.length > MAX_TABLE_ROWS) {
    doc
      .font(faces.italic)
      .fontSize(8)
      .fillColor(style.muted)
      .text(`… ${rows.length - MAX_TABLE_ROWS} more rows omitted`, left, doc.y + 2);
    doc.y += 12;
  }
}
