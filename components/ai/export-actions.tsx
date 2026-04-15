"use client";

import { useState } from "react";
import {
  AI_FOCUS_RING_CLASS,
  AI_PANEL_SECTION_CLASS,
  AI_PANEL_TITLE_CLASS,
} from "./shared";

interface ExportActionsProps {
  traceId: string;
}

interface ExportResponse {
  fileName: string;
  downloadUrl: string;
}

export function ExportActions({ traceId }: ExportActionsProps) {
  const [error, setError] = useState<string | null>(null);

  const requestExport = async (format: "pdf" | "csv") => {
    setError(null);
    try {
      const response = await fetch("/api/ai/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traceId, format }),
      });
      const body = (await response.json()) as
        | ExportResponse
        | { message: string };

      if (!response.ok) {
        setError((body as { message: string }).message ?? "Unable to export.");
        return;
      }

      const payload = body as ExportResponse;
      const link = document.createElement("a");
      link.href = payload.downloadUrl;
      link.download = payload.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setError("Unable to export.");
    }
  };

  return (
    <section className={AI_PANEL_SECTION_CLASS}>
      <h2 className={`mb-2 ${AI_PANEL_TITLE_CLASS}`}>Exports</h2>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => requestExport("pdf")}
          className={`rounded-md border border-slate-300 px-3 py-2 text-sm ${AI_FOCUS_RING_CLASS}`}
        >
          Export PDF
        </button>
        <button
          type="button"
          onClick={() => requestExport("csv")}
          className={`rounded-md border border-slate-300 px-3 py-2 text-sm ${AI_FOCUS_RING_CLASS}`}
        >
          Export CSV
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
