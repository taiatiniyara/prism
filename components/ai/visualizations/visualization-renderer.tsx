"use client";

import dynamic from "next/dynamic";
import type { AiVisualization } from "@/lib/ai/types";
import { TableView } from "./table-view";
import { BarChartView } from "./bar-chart-view";
import { LineChartView } from "./line-chart-view";
import { LeaderboardView } from "./leaderboard-view";

const EChartsView = dynamic(() => import("./echarts-view"), { ssr: false });

interface VisualizationRendererProps {
  visualization: AiVisualization;
}

export function VisualizationRenderer({
  visualization,
}: VisualizationRendererProps) {
  switch (visualization.type) {
    case "table":
      return <TableView data={visualization} />;
    case "bar-chart":
      return <BarChartView data={visualization} />;
    case "line-chart":
      return <LineChartView data={visualization} />;
    case "leaderboard":
      return <LeaderboardView data={visualization} />;
    case "sankey":
    case "heatmap":
    case "radar":
    case "scatter":
      return <EChartsView visualization={visualization} />;
    default:
      return null;
  }
}
