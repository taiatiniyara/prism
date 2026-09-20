"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  buildContextText,
  buildCsv,
  copyToClipboard,
  downloadCsv,
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

type SortDirection = "asc" | "desc";

const FILTER_THRESHOLD_ROWS = 8;

export function TableView({ data, onAskFollowUp }: TableViewProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [filterText, setFilterText] = useState("");
  const [sort, setSort] = useState<{ column: number; direction: SortDirection } | null>(null);

  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return data.rows;
    const needle = filterText.trim().toLowerCase();
    return data.rows.filter((row) =>
      row.some((cell) => cell !== null && String(cell).toLowerCase().includes(needle)),
    );
  }, [data.rows, filterText]);

  const visibleRows = useMemo(() => {
    if (!sort) return filteredRows;
    const { column, direction } = sort;
    const sorted = [...filteredRows].sort((a, b) => {
      const av = a[column];
      const bv = b[column];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), undefined, { numeric: true });
    });
    return direction === "asc" ? sorted : sorted.reverse();
  }, [filteredRows, sort]);

  const toggleSort = (column: number) => {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };

  const csv = useMemo(
    () => (data.columns.length > 0 && visibleRows.length > 0 ? buildCsv(data.columns, visibleRows) : ""),
    [data.columns, visibleRows],
  );
  const contextText = useMemo(
    () => (data.title ? buildContextText(data.title, csv) : ""),
    [data.title, csv],
  );
  const filename = slugifyTitle(data.title, "table");

  const renderHeaderCell = (col: string, i: number) => (
    <th
      key={i}
      className="text-muted-foreground dark:text-muted-foreground whitespace-nowrap border-border border-b px-3 py-2 text-left text-xs font-medium dark:border-border"
    >
      <button
        type="button"
        onClick={() => toggleSort(i)}
        className="hover:text-foreground flex items-center gap-1 transition-colors"
        aria-label={`Sort by ${col}`}
      >
        {col}
        {sort?.column === i ? (
          sort.direction === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-30" />
        )}
      </button>
    </th>
  );

  const renderTable = (caption: boolean) => (
    <div className="border-border overflow-x-auto rounded-md border dark:border-border">
      <table className="w-full text-sm" aria-label={data.title || "Data table"}>
        {caption && <caption className="sr-only">{data.title || "Data table"}</caption>}
        <thead className="bg-muted/50 dark:bg-muted/30 sticky top-0 z-10">
          <tr>{data.columns.map((col, i) => renderHeaderCell(col, i))}</tr>
        </thead>
        <tbody>
          {visibleRows.map((row, rowIdx) => (
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

  const showFilter = data.rows.length >= FILTER_THRESHOLD_ROWS;

  return (
    <VisualizationCard
      title={data.title}
      onCopyCsv={() => copyToClipboard(csv)}
      onDownloadCsv={csv ? () => downloadCsv(`${filename}.csv`, csv) : undefined}
      onDownloadPng={() => {
        if (!captureRef.current) throw new Error("table not ready");
        return downloadNodeAsPng(captureRef.current, `${filename}.png`);
      }}
      modal={
        <div className="overflow-auto">
          <table className="w-full text-sm" aria-label={data.title || "Data table"}>
            <thead className="bg-muted/50 dark:bg-muted/30 sticky top-0 z-10">
              <tr>{data.columns.map((col, i) => renderHeaderCell(col, i))}</tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIdx) => (
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
      {showFilter && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter rows…"
            aria-label="Filter table rows"
            className="border-border bg-background text-foreground placeholder:text-muted-foreground h-7 w-40 rounded-md border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-muted-foreground dark:text-muted-foreground shrink-0 text-[11px]">
            Showing {visibleRows.length} of {data.rows.length} rows
          </span>
        </div>
      )}
      <div className="max-h-[400px] overflow-auto">
        <div ref={captureRef}>{renderTable(true)}</div>
      </div>
    </VisualizationCard>
  );
}
