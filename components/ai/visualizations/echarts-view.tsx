"use client";

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { AiVisualization } from "@/lib/ai/types";

interface EChartsViewProps {
  visualization: AiVisualization;
}

export default function EChartsView({ visualization }: EChartsViewProps) {
  const getOption = (): EChartsOption => {
    switch (visualization.type) {
      case "sankey":
        return {
          title: { text: visualization.title, left: "center" },
          series: [
            {
              type: "sankey",
              data: visualization.nodes,
              links: visualization.links,
              emphasis: { focus: "adjacency" },
            },
          ],
        };

      case "heatmap":
        return {
          title: { text: visualization.title, left: "center" },
          tooltip: { position: "top" },
          xAxis: { type: "category", data: visualization.xAxis },
          yAxis: { type: "category", data: visualization.yAxis },
          visualMap: {
            min: 0,
            max: Math.max(...visualization.values.flat()),
            calculable: true,
          },
          series: [
            {
              type: "heatmap",
              data: visualization.values.flatMap((row, yIdx) =>
                row.map((value, xIdx) => [xIdx, yIdx, value]),
              ),
              label: { show: true },
            },
          ],
        };

      case "radar":
        return {
          title: { text: visualization.title, left: "center" },
          radar: {
            indicator: visualization.indicators.map((ind) => ({
              name: ind.name,
              max: ind.max,
            })),
          },
          series: [
            {
              type: "radar",
              data: visualization.series.map((s) => ({
                name: s.name,
                value: s.values,
              })),
            },
          ],
        };

      case "scatter":
        return {
          title: { text: visualization.title, left: "center" },
          xAxis: {},
          yAxis: {},
          series: [
            {
              type: "scatter",
              data: visualization.points.map((p) => ({
                value: [p.x, p.y],
                name: p.label,
              })),
            },
          ],
        };

      default:
        return {};
    }
  };

  return (
    <div className="border-border rounded-md border p-4">
      <ReactECharts option={getOption()} style={{ height: "300px" }} />
    </div>
  );
}
