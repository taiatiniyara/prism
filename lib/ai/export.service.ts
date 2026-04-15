import type { AiQueryResponse } from "./types";

export type ExportFormat = "pdf" | "csv";

export interface ExportResult {
  traceId: string;
  format: ExportFormat;
  fileName: string;
  contentType: string;
  downloadUrl: string;
}

const toCsv = (response: AiQueryResponse): string => {
  const rows = response.rows;
  if (!rows.length) {
    return 'summary\n"No rows"\n';
  }

  const columns = Object.keys(rows[0]);
  const header = columns.join(",");
  const body = rows
    .map((row) =>
      columns
        .map((column) => {
          const value = row[column];
          return `"${String(value ?? "").replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\n");

  return `${header}\n${body}\n`;
};

const toPdfLikeText = (response: AiQueryResponse): string => {
  const lines = [
    "PRISM AI REPORT",
    `Trace: ${response.traceId}`,
    "",
    `Summary: ${response.summary}`,
    "",
    "Metrics:",
    ...response.metrics.map((metric) => `- ${metric.label}: ${metric.value}`),
  ];

  return lines.join("\n");
};

export const generateExport = (
  response: AiQueryResponse,
  format: ExportFormat,
): ExportResult => {
  if (format === "csv") {
    const csv = toCsv(response);
    const encoded = Buffer.from(csv, "utf8").toString("base64");
    return {
      traceId: response.traceId,
      format,
      fileName: `ai-report-${response.traceId}.csv`,
      contentType: "text/csv",
      downloadUrl: `data:text/csv;base64,${encoded}`,
    };
  }

  const pdfText = toPdfLikeText(response);
  const encoded = Buffer.from(pdfText, "utf8").toString("base64");
  return {
    traceId: response.traceId,
    format,
    fileName: `ai-report-${response.traceId}.pdf`,
    contentType: "application/pdf",
    downloadUrl: `data:application/pdf;base64,${encoded}`,
  };
};
