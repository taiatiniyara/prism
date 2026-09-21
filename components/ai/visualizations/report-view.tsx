"use client";

import { useState } from "react";
import { safeReportFilename } from "@/lib/ai/report-filename";
import type { AiReportVisualization } from "@/lib/ai/types";

interface ReportViewProps {
  data: AiReportVisualization;
  onAskFollowUp?: (text: string) => void;
}

type ReportFormat = "pdf" | "doc";

const FORMAT_META: Record<
  ReportFormat,
  { route: string; ext: string; label: string }
> = {
  pdf: { route: "/api/ai/report-pdf", ext: "pdf", label: "PDF" },
  doc: { route: "/api/ai/report-doc", ext: "doc", label: "Word" },
};

/** POST the report to the server export route and trigger a download of the blob. */
async function downloadReport(
  data: AiReportVisualization,
  format: ReportFormat,
): Promise<void> {
  const { route, ext, label } = FORMAT_META[format];
  const res = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: data.title,
      generated_at: data.generated_at,
      executive_summary: data.executive_summary,
      sections: data.sections,
      filename: data.title,
    }),
  });
  if (!res.ok) {
    let message = `${label} export failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeReportFilename(data.title)}.${ext}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const fmtCell = (value: unknown): string =>
  value === null || value === undefined ? "-" : String(value);

export function ReportView({ data }: ReportViewProps) {
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async (format: ReportFormat) => {
    setError(null);
    setBusy(format);
    try {
      await downloadReport(data, format);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `${FORMAT_META[format].label} export failed.`,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="border-border rounded-md border dark:border-border">
      <div className="border-border flex items-start justify-between gap-3 border-b px-4 py-3 dark:border-border">
        <div className="min-w-0">
          <h3 className="text-foreground truncate text-sm font-semibold">
            {data.title || "Performance Report"}
          </h3>
          {data.generated_at && (
            <p className="text-muted-foreground text-xs">
              Generated {data.generated_at}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => handleDownload("pdf")}
            disabled={busy !== null}
            className="border-border shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-border"
          >
            {busy === "pdf" ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={() => handleDownload("doc")}
            disabled={busy !== null}
            className="border-border shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-border"
          >
            {busy === "doc" ? "Preparing Word…" : "Download Word"}
          </button>
        </div>
      </div>

      <div className="max-h-[440px] space-y-4 overflow-auto px-4 py-3">
        {error && <p className="text-destructive text-xs">{error}</p>}

        {data.executive_summary && (
          <div>
            <p className="text-foreground mb-1 text-xs font-semibold uppercase tracking-wide">
              Executive Summary
            </p>
            <p className="text-foreground text-sm">{data.executive_summary}</p>
          </div>
        )}

        {data.sections?.map((section, i) => (
          <section key={i} className="space-y-1.5">
            <h4 className="text-foreground text-sm font-semibold">
              {section.heading}
            </h4>
            {section.content && (
              <p className="text-foreground text-sm">{section.content}</p>
            )}
            {section.data_table?.columns?.length ? (
              <div className="border-border overflow-x-auto rounded-md border dark:border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 dark:bg-muted/30">
                    <tr>
                      {section.data_table.columns.map((col, ci) => (
                        <th
                          key={ci}
                          className="border-border whitespace-nowrap border-b px-2.5 py-1.5 text-left font-medium dark:border-border"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.data_table.rows.map((row, ri) => (
                      <tr key={ri}>
                        {section.data_table!.columns.map((col, ci) => (
                          <td
                            key={ci}
                            className="border-border border-b px-2.5 py-1.5 dark:border-border"
                          >
                            {fmtCell(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {section.insight && (
              <p className="text-primary text-xs italic">
                Insight: {section.insight}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
