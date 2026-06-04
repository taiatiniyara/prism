"use client";

import type { AiLeaderboardVisualization } from "@/lib/ai/types";

interface LeaderboardViewProps {
  data: AiLeaderboardVisualization;
}

export function LeaderboardView({ data }: LeaderboardViewProps) {
  const maxValue = Math.max(...data.items.map((item) => item.value));

  return (
    <div className="border-border rounded-md border p-4">
      <h4 className="mb-3 text-sm font-medium">{data.title}</h4>
      <div className="space-y-2">
        {data.items.map((item, index) => {
          const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

          return (
            <div key={index} className="flex items-center gap-3">
              <span className="text-muted-foreground w-6 text-right text-xs font-medium">
                {index + 1}
              </span>
              <div className="flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm">{item.label}</span>
                  <span className="text-muted-foreground text-xs">
                    {item.value}
                    {item.unit ? ` ${item.unit}` : ""}
                  </span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
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
