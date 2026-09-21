import {
  DEFAULT_PDF_REPORT_STYLE,
  type PdfReportStyle,
} from "./pdf-settings-constants";
import { sanitizeForPdf, type ReportPdfInput } from "./report-pdf";

/**
 * Word (.doc) export of the AI performance report. Emits a Word-openable HTML
 * document (the classic HTML-flavoured .doc): Word opens it with real, editable
 * headings and tables, and it mirrors the PDF style (colours, type sizes, page
 * size + margin) from the same PdfReportStyle. No dependency required.
 *
 * A custom brand TTF applies to the PDF only — HTML .doc can't embed a font
 * file, so Word renders these in its own font stack. Values are HTML-escaped to
 * keep report content from breaking the markup.
 *
 * Model-authored text is run through the SAME sanitizeForPdf() the PDF uses, so
 * the two exports read identically: RAG status emoji (✅⚠️🔴 …) become words
 * ("On track"/"At risk"/"Off track") in Word too, not coloured emoji. (Eugene's
 * call — match the PDF wording.) HTML-escaping is applied after, on top.
 */

const MAX_TABLE_ROWS = 200;

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Model text → PDF-consistent sanitize, then HTML-escape. */
const mtext = (v: unknown): string => esc(sanitizeForPdf(String(v ?? "")));

const cell = (v: unknown): string =>
  v === null || v === undefined ? "" : mtext(v);

export function renderReportDoc(
  report: ReportPdfInput,
  style: PdfReportStyle = DEFAULT_PDF_REPORT_STYLE,
): string {
  const pageSize = style.pageSize === "LETTER" ? "8.5in 11.0in" : "21.0cm 29.7cm";
  const generated =
    report.generated_at || new Date().toISOString().slice(0, 10);

  const exec = report.executive_summary
    ? `<h2 class="sec exech">Executive Summary</h2>\n<p class="body">${mtext(report.executive_summary)}</p>`
    : "";

  const sectionsHtml = (report.sections ?? [])
    .map((s) => {
      const parts: string[] = [`<h2 class="sec">${mtext(s.heading || "")}</h2>`];
      if (s.content) parts.push(`<p class="body">${mtext(s.content)}</p>`);
      if (s.data_table?.columns?.length) {
        const cols = s.data_table.columns;
        const head = `<tr>${cols.map((c) => `<th>${mtext(c)}</th>`).join("")}</tr>`;
        const allRows = s.data_table.rows ?? [];
        const body = allRows
          .slice(0, MAX_TABLE_ROWS)
          .map(
            (r) => `<tr>${cols.map((c) => `<td>${cell(r[c])}</td>`).join("")}</tr>`,
          )
          .join("");
        parts.push(
          `<table class="tbl"><thead>${head}</thead><tbody>${body}</tbody></table>`,
        );
        if (allRows.length > MAX_TABLE_ROWS) {
          parts.push(
            `<p class="omitted">… ${allRows.length - MAX_TABLE_ROWS} more rows omitted</p>`,
          );
        }
      }
      if (s.insight) parts.push(`<p class="insight">Insight: ${mtext(s.insight)}</p>`);
      return parts.join("\n");
    })
    .join("\n");

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${mtext(report.title || "PRISM Report")}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: ${pageSize}; margin: ${style.margin}pt; }
body { font-family: Helvetica, Arial, sans-serif; color: ${style.ink}; }
.eyebrow { color: ${style.accent}; font-size: 9pt; font-weight: bold; }
.title { color: ${style.ink}; font-size: ${style.titleSize}pt; font-weight: bold; margin: 2pt 0; }
.gen { color: ${style.muted}; font-size: 9pt; }
hr { border: none; border-top: 1px solid ${style.rule}; margin: 8pt 0; }
.sec { color: ${style.ink}; font-size: ${style.headingSize}pt; font-weight: bold; margin: 10pt 0 3pt; }
.exech { font-size: ${style.headingSize - 1}pt; }
.body { color: ${style.ink}; font-size: ${style.bodySize}pt; margin: 0 0 6pt; }
.insight { color: ${style.accent}; font-style: italic; font-size: ${style.bodySize}pt; margin: 4pt 0 0; }
.omitted { color: ${style.muted}; font-style: italic; font-size: 8pt; margin: 2pt 0 0; }
.tbl { border-collapse: collapse; width: 100%; font-size: ${style.tableFontSize}pt; margin: 4pt 0; }
.tbl th, .tbl td { border: 0.5pt solid ${style.rule}; padding: 3pt 5pt; text-align: left; vertical-align: top; }
.tbl th { font-weight: bold; color: ${style.ink}; }
.tbl td { color: #374151; }
</style>
</head>
<body>
<div class="eyebrow">PRISM &middot; Pacific Power Association</div>
<div class="title">${mtext(report.title || "Performance Report")}</div>
<div class="gen">Generated ${esc(generated)}</div>
<hr>
${exec}
${sectionsHtml}
</body>
</html>`;
}
