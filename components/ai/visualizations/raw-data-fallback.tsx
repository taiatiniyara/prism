"use client";

interface RawDataFallbackProps {
  data: unknown;
}

export function RawDataFallback({ data }: RawDataFallbackProps) {
  const records = (() => {
    const candidate = Array.isArray(data) ? data : (data as { data?: unknown } | null)?.data;
    if (!Array.isArray(candidate)) return [];
    return candidate.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  })();

  if (records.length === 0) {
    return (
      <div className="text-muted-foreground dark:text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
        No data available
      </div>
    );
  }

  const columns = Array.from(
    new Set(records.flatMap((item) => Object.keys(item))),
  ).slice(0, 20);

  return (
    <div className="max-h-[320px] overflow-auto rounded-md border border-dashed">
      <table className="w-full text-sm" aria-label="Raw data">
        <thead className="bg-muted/50 dark:bg-muted/30 sticky top-0">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="text-muted-foreground dark:text-muted-foreground whitespace-nowrap border-b px-3 py-2 text-left text-xs font-medium"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.slice(0, 100).map((item, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/30 dark:hover:bg-muted/20">
              {columns.map((col) => (
                <td key={col} className="text-foreground border-b px-3 py-1.5">
                  {item[col] === null || item[col] === undefined ? "-" : String(item[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}