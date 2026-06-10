"use client";

import type { AiTableVisualization } from "@/lib/ai/types";

interface TableViewProps {
  data: AiTableVisualization;
}

export function TableView({ data }: TableViewProps) {
  if (!data.columns?.length || !data.rows?.length) {
    return (
      <div className="border-border rounded-md border p-4 text-center text-sm text-muted-foreground dark:border-border dark:text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="border-border max-h-[400px] overflow-auto rounded-md border dark:border-border">
      <table className="w-full text-sm" aria-label={data.title || "Data table"}>
        <caption className="sr-only">{data.title || "Data table"}</caption>
        <thead className="bg-muted/50 dark:bg-muted/30 sticky top-0 z-10">
          <tr>
            {data.columns.map((col, i) => (
              <th
                key={i}
                className="border-border whitespace-nowrap border-b px-3 py-2 text-left font-medium dark:border-border"
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
                <td key={cellIdx} className="border-border border-b px-3 py-2 dark:border-border">
                  {cell === null ? "-" : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
