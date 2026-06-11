"use client";

import type { AiLeaderboardVisualization } from "@/lib/ai/types";

interface LeaderboardViewProps {
  data: AiLeaderboardVisualization;
}

export function LeaderboardView({ data }: LeaderboardViewProps) {
  if (!data.items?.length) {
    return (
      <div className="border-border rounded-md border p-4 text-center text-sm text-muted-foreground dark:border-border dark:text-muted-foreground">
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.items.map((item) => item.value));

  return (
    <div className="border-border rounded-md border p-4 dark:border-border">
      <h4 className="mb-3 text-sm font-medium dark:text-foreground">{data.title}</h4>
      <div className="space-y-2">
        {data.items.map((item, index) => {
          const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

          return (
            <div key={index} className="flex items-center gap-3">
              <span className="text-muted-foreground w-6 text-right text-xs font-medium dark:text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm dark:text-foreground">{item.label}</span>
                  <span className="text-muted-foreground shrink-0 text-xs dark:text-muted-foreground">
                    {item.value}
                    {item.unit ? ` ${item.unit}` : ""}
                  </span>
                </div>
                <div className="bg-muted dark:bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary dark:bg-primary h-full rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
