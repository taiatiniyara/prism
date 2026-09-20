"use client";

import { useMemo, useRef } from "react";
import {
  buildContextText,
  buildCsv,
  copyToClipboard,
  downloadCsv,
  downloadNodeAsPng,
  fmtNumber,
  slugifyTitle,
} from "@/lib/ai/visualization-export";
import { ChartFollowUp } from "./chart-follow-up";
import { VisualizationCard } from "./visualization-card";
import type { AiLeaderboardVisualization } from "@/lib/ai/types";

interface LeaderboardViewProps {
  data: AiLeaderboardVisualization;
  onAskFollowUp?: (text: string) => void;
}

export function LeaderboardView({ data, onAskFollowUp }: LeaderboardViewProps) {
  const captureRef = useRef<HTMLDivElement>(null);

  const csv = useMemo(
    () =>
      data.items.length > 0
        ? buildCsv(["Rank", "Label", "Value", "Unit"], data.items.map((item, i) => [i + 1, item.label, item.value, item.unit ?? null]))
        : "",
    [data.items],
  );
  const contextText = useMemo(
    () => (data.title ? buildContextText(data.title, csv) : ""),
    [data.title, csv],
  );
  const filename = slugifyTitle(data.title, "leaderboard");

  const maxValue = Math.max(0, ...data.items.map((item) => item.value));

  if (!data.items?.length) {
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
      onDownloadCsv={csv ? () => downloadCsv(`${filename}.csv`, csv) : undefined}
      onDownloadPng={() => {
        if (!captureRef.current) throw new Error("chart not ready");
        return downloadNodeAsPng(captureRef.current, `${filename}.png`);
      }}
      footer={
        onAskFollowUp ? (
          <ChartFollowUp contextText={contextText} onAsk={onAskFollowUp} />
        ) : undefined
      }
    >
      <div ref={captureRef} className="space-y-2">
        {data.items.map((item, index) => {
          const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

          return (
            <div key={index} className="flex items-center gap-3">
              <span
                className={`w-6 shrink-0 text-right text-xs font-semibold ${
                  index < 3 ? "text-amber-500" : "text-muted-foreground"
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-foreground truncate text-sm">{item.label}</span>
                  <span className="text-muted-foreground dark:text-muted-foreground shrink-0 text-xs">
                    {fmtNumber(item.value)}
                    {item.unit ? ` ${item.unit}` : ""}
                  </span>
                </div>
                <div className="bg-muted dark:bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary dark:bg-primary h-full rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </VisualizationCard>
  );
}