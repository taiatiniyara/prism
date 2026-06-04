"use client";

import type { AiTableVisualization } from "@/lib/ai/types";

interface TableViewProps {
  data: AiTableVisualization;
}

export function TableView({ data }: TableViewProps) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {data.columns.map((col, i) => (
              <th
                key={i}
                className="border-border whitespace-nowrap border-b px-3 py-2 text-left font-medium"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/30">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="border-border border-b px-3 py-2">
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
