"use client";

import dynamic from "next/dynamic";
import type { AiVisualization } from "@/lib/ai/types";
import { TableView } from "./table-view";
import { BarChartView } from "./bar-chart-view";
import { LineChartView } from "./line-chart-view";
import { AreaChartView } from "./area-chart-view";
import { LeaderboardView } from "./leaderboard-view";
import { ReportView } from "./report-view";
import { VisualizationCard } from "./visualization-card";
import { RawDataFallback } from "./raw-data-fallback";

const EChartsView = dynamic(() => import("./echarts-view"), {
  ssr: false,
  loading: () => (
    <div className="border-border rounded-md border p-4 dark:border-border">
      <div className="animate-pulse space-y-3">
        <div className="bg-muted dark:bg-muted mx-auto h-4 w-1/3 rounded" />
        <div className="bg-muted dark:bg-muted h-[250px] rounded" />
      </div>
    </div>
  ),
});

interface VisualizationRendererProps {
  visualization: AiVisualization;
  onAskFollowUp?: (text: string) => void;
}

export function VisualizationRenderer({
  visualization,
  onAskFollowUp,
}: VisualizationRendererProps) {
  switch (visualization.type) {
    case "table":
      return <TableView data={visualization} onAskFollowUp={onAskFollowUp} />;
    case "bar-chart":
      return <BarChartView data={visualization} onAskFollowUp={onAskFollowUp} />;
    case "line-chart":
      return <LineChartView data={visualization} onAskFollowUp={onAskFollowUp} />;
    case "area-chart":
      return <AreaChartView data={visualization} onAskFollowUp={onAskFollowUp} />;
    case "leaderboard":
      return <LeaderboardView data={visualization} onAskFollowUp={onAskFollowUp} />;
    case "report":
      return <ReportView data={visualization} onAskFollowUp={onAskFollowUp} />;
    case "sankey":
    case "heatmap":
    case "radar":
    case "scatter":
      return <EChartsView visualization={visualization} onAskFollowUp={onAskFollowUp} />;
    default: {
      // The model can emit a `type` outside AiVisualizationType (typo'd or
      // not yet supported) — the static union type can't see that, but at
      // runtime it's just an unvalidated JSON blob, so fall back to a raw
      // view instead of silently rendering nothing.
      const unknownViz = visualization as unknown as { type?: string; title?: string; [key: string]: unknown };
      const arrayField = Object.values(unknownViz).find(
        (value): value is unknown[] => Array.isArray(value) && value.length > 0 && typeof value[0] === "object",
      );
      return (
        <VisualizationCard
          title={unknownViz.title || "Unsupported visualization"}
          subtitle={unknownViz.type ? `Type "${unknownViz.type}" isn't supported yet — showing raw data` : undefined}
        >
          {arrayField ? (
            <RawDataFallback data={arrayField} />
          ) : (
            <pre className="max-h-[320px] overflow-auto rounded-md border border-dashed p-3 text-xs">
              {JSON.stringify(unknownViz, null, 2)}
            </pre>
          )}
        </VisualizationCard>
      );
    }
  }
}
