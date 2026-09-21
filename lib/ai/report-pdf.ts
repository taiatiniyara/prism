import PDFDocument from "pdfkit";

/**
 * Server-side PDF generation for the AI performance report (the shape returned
 * by generatePerformanceReport → AutomatedReport). Uses pdfkit's built-in
 * Helvetica fonts only (no external font files), and is declared in
 * next.config `serverExternalPackages` so it loads from node_modules at runtime.
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

const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#e5e7eb";
const ACCENT = "#1d4ed8";
const MAX_TABLE_ROWS = 200;

const cell = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

export async function renderReportPdf(report: ReportPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    bufferPages: true,
    info: { Title: report.title || "PRISM Report" },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const left = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;

  // ── Header ───────────────────────────────────────────────
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(ACCENT)
    .text("PRISM · Pacific Power Association", left, doc.y);
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(INK)
    .text(report.title || "Performance Report", { width: usableWidth });
  doc
    .font("Helvetica")
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
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Executive Summary");
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(INK)
      .text(report.executive_summary, { width: usableWidth });
    doc.moveDown(0.8);
  }

  // ── Sections ─────────────────────────────────────────────
  for (const section of report.sections ?? []) {
    if (doc.y + 60 > bottom) doc.addPage();

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(INK)
      .text(section.heading || "", { width: usableWidth });
    doc.moveDown(0.2);

    if (section.content) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(INK)
        .text(section.content, { width: usableWidth });
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
      );
      doc.moveDown(0.3);
    }

    if (section.insight) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(10)
        .fillColor(ACCENT)
        .text(`Insight: ${section.insight}`, { width: usableWidth });
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
): void {
  const colWidth = usableWidth / columns.length;
  const rowHeight = 18;

  const drawRow = (values: string[], header: boolean) => {
    if (doc.y + rowHeight > bottom) doc.addPage();
    const y = doc.y;
    doc
      .font(header ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .fillColor(header ? INK : "#374151");
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
      .strokeColor(RULE)
      .stroke();
    doc.x = left;
    doc.y = y + rowHeight;
  };

  drawRow(columns, true);
  for (const row of rows.slice(0, MAX_TABLE_ROWS)) {
    drawRow(
      columns.map((col) => cell(row[col])),
      false,
    );
  }
  if (rows.length > MAX_TABLE_ROWS) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(8)
      .fillColor(MUTED)
      .text(`… ${rows.length - MAX_TABLE_ROWS} more rows omitted`, left, doc.y + 2);
    doc.y += 12;
  }
}
