"use client";

import { useMemo, useRef } from "react";
import {
  buildContextText,
  buildCsv,
  copyToClipboard,
  downloadNodeAsPng,
  slugifyTitle,
} from "@/lib/ai/visualization-export";
import { ChartFollowUp } from "./chart-follow-up";
import { VisualizationCard } from "./visualization-card";
import type { AiTableVisualization } from "@/lib/ai/types";

interface TableViewProps {
  data: AiTableVisualization;
  onAskFollowUp?: (text: string) => void;
}

export function TableView({ data, onAskFollowUp }: TableViewProps) {
  const captureRef = useRef<HTMLDivElement>(null);

  const csv = useMemo(
    () => (data.columns.length > 0 && data.rows.length > 0 ? buildCsv(data.columns, data.rows) : ""),
    [data.columns, data.rows],
  );
  const contextText = useMemo(
    () => (data.title ? buildContextText(data.title, csv) : ""),
    [data.title, csv],
  );
  const filename = slugifyTitle(data.title, "table");

  const renderTable = (caption: boolean) => (
    <div className="border-border overflow-x-auto rounded-md border dark:border-border">
      <table className="w-full text-sm" aria-label={data.title || "Data table"}>
        {caption && <caption className="sr-only">{data.title || "Data table"}</caption>}
        <thead className="bg-muted/50 dark:bg-muted/30 sticky top-0 z-10">
          <tr>
            {data.columns.map((col, i) => (
              <th
                key={i}
                className="text-muted-foreground dark:text-muted-foreground whitespace-nowrap border-border border-b px-3 py-2 text-left text-xs font-medium dark:border-border"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/30 dark:hover:bg-muted/20">
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className="text-foreground whitespace-nowrap border-border border-b px-3 py-2 dark:border-border"
                >
                  {cell === null ? "-" : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!data.columns?.length || !data.rows?.length) {
    return (
      <VisualizationCard
        title={data.title}
        footer={
          onAskFollowUp ? (
            <ChartFollowUp contextText={contextText} onAsk={onAskFollowUp} />
          ) : undefined
        }
      >
        <div className="text-muted-foreground dark:text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
          No data available
        </div>
      </VisualizationCard>
    );
  }

  return (
    <VisualizationCard
      title={data.title}
      onCopyCsv={() => copyToClipboard(csv)}
      onDownloadPng={() => {
        if (!captureRef.current) throw new Error("table not ready");
        return downloadNodeAsPng(captureRef.current, `${filename}.png`);
      }}
      modal={
        <div className="overflow-auto">
          <table className="w-full text-sm" aria-label={data.title || "Data table"}>
            <thead className="bg-muted/50 dark:bg-muted/30 sticky top-0 z-10">
              <tr>
                {data.columns.map((col, i) => (
                  <th
                    key={i}
                    className="text-muted-foreground dark:text-muted-foreground whitespace-nowrap border-b px-3 py-2 text-left text-xs font-medium"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-muted/30 dark:hover:bg-muted/20">
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className="text-foreground whitespace-nowrap border-b px-3 py-2"
                    >
                      {cell === null ? "-" : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      footer={
        onAskFollowUp ? (
          <ChartFollowUp contextText={contextText} onAsk={onAskFollowUp} />
        ) : undefined
      }
    >
      <div className="max-h-[400px] overflow-auto">
        <div ref={captureRef}>{renderTable(true)}</div>
      </div>
    </VisualizationCard>
  );
}