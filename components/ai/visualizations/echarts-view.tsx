"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { AiVisualization } from "@/lib/ai/types";

interface EChartsViewProps {
  visualization: AiVisualization;
}

export default function EChartsView({ visualization }: EChartsViewProps) {
  const option = useMemo((): EChartsOption => {
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

      case "heatmap": {
        const flat = visualization.values?.flat?.() ?? [];
        const maxVal = flat.length > 0 ? Math.max(...flat) : 0;
        return {
          title: { text: visualization.title, left: "center" },
          tooltip: { position: "top" },
          xAxis: { type: "category", data: visualization.xAxis },
          yAxis: { type: "category", data: visualization.yAxis },
          visualMap: {
            min: 0,
            max: maxVal,
            calculable: true,
          },
          series: [
            {
              type: "heatmap",
              data: visualization.values?.flatMap?.((row, yIdx) =>
                row.map((value, xIdx) => [xIdx, yIdx, value]),
              ) ?? [],
              label: { show: true },
            },
          ],
        };
      }

      case "radar":
        return {
          title: { text: visualization.title, left: "center" },
          radar: {
            indicator: visualization.indicators?.map?.((ind) => ({
              name: ind.name,
              max: ind.max,
            })) ?? [],
          },
          series: [
            {
              type: "radar",
              data: visualization.series?.map?.((s) => ({
                name: s.name,
                value: s.values,
              })) ?? [],
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
              data: visualization.points?.map?.((p) => ({
                value: [p.x, p.y],
                name: p.label,
              })) ?? [],
            },
          ],
        };

      default:
        return {};
    }
  }, [visualization]);

  const hasData = (() => {
    switch (visualization.type) {
      case "sankey": return (visualization.nodes?.length ?? 0) > 0;
      case "heatmap": return (visualization.values?.length ?? 0) > 0;
      case "radar": return (visualization.indicators?.length ?? 0) > 0;
      case "scatter": return (visualization.points?.length ?? 0) > 0;
      default: return false;
    }
  })();

  if (!hasData) {
    return (
      <div className="border-border rounded-md border p-4 text-center text-sm text-muted-foreground dark:border-border dark:text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="border-border rounded-md border p-4 dark:border-border">
      <ReactECharts option={option} style={{ height: "300px" }} />
    </div>
  );
}
