"use client";

import { useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption, EChartsType } from "echarts";
import {
  downloadEchartsPng,
  fmtNumber,
  slugifyTitle,
} from "@/lib/ai/visualization-export";
import { ChartFollowUp } from "./chart-follow-up";
import { VisualizationCard } from "./visualization-card";
import { cssVarToColor, useChartTheme } from "./visualization-theme";
import type {
  AiHeatmapVisualization,
  AiRadarVisualization,
  AiSankeyVisualization,
  AiScatterVisualization,
} from "@/lib/ai/types";

interface EChartsViewProps {
  visualization: AiHeatmapVisualization | AiRadarVisualization | AiSankeyVisualization | AiScatterVisualization;
  onAskFollowUp?: (text: string) => void;
}

type ClickParams = { dataIndex?: number; name?: string };

export default function EChartsView({ visualization, onAskFollowUp }: EChartsViewProps) {
  const theme = useChartTheme();
  const [showLabels, setShowLabels] = useState(false);
  const chartRef = useRef<ReactECharts | null>(null);
  const [suggestion, setSuggestion] = useState("");

  const title = visualization.title;
  const filename = slugifyTitle(title, "chart");

  const supportsLabels = visualization.type === "heatmap" || visualization.type === "radar";

  const contextText = useMemo(() => {
    switch (visualization.type) {
      case "scatter": {
        const lines = (visualization as AiScatterVisualization).points.map(
          (p) => `${p.label ?? "point"}: ${fmtNumber(p.x)}, ${fmtNumber(p.y)}`,
        );
        return `${title}\n${lines.join("\n")}`;
      }
      case "heatmap": {
        const heat = visualization as AiHeatmapVisualization;
        const lines = heat.values.map((row, yIdx) =>
          row.map((v, xIdx) => `${heat.xAxis[xIdx]} × ${heat.yAxis[yIdx]}: ${fmtNumber(v)}`).join("\n"),
        );
        return `${title}\n${lines.join("\n")}`;
      }
      case "radar": {
        const radar = visualization as AiRadarVisualization;
        const perSeries = radar.series
          .map((s) => `${s.name}: ${s.values.map(fmtNumber).join(", ")}`)
          .join("\n");
        return `${title}\nindicators: ${radar.indicators.map((i) => i.name).join(", ")}\n${perSeries}`;
      }
      case "sankey": {
        const sankey = visualization as AiSankeyVisualization;
        const links = sankey.links
          .map((l) => `${l.source} → ${l.target}: ${l.value}`)
          .join("\n");
        return `${title}\nnodes: ${sankey.nodes.map((n) => n.name).join(", ")}\n${links}`;
      }
      default:
        return title;
    }
  }, [visualization, title]);

  const flatMatrix = useMemo(() => {
    if (visualization.type !== "heatmap") return [] as number[][];
    const heat = visualization as AiHeatmapVisualization;
    const flat: number[][] = [];
    heat.values.forEach((row, yIdx) =>
      row.forEach((value, xIdx) => flat.push([xIdx, yIdx, value])),
    );
    return flat;
  }, [visualization]);

  const option = useMemo<EChartsOption>(
    () => {
      const baseText = { color: theme.textColor };
      const axisLabel = { color: theme.mutedColor };
      const splitLine = { lineStyle: { color: theme.gridColor } };
      const tooltip = {
        backgroundColor: theme.tooltipBg,
        borderColor: theme.tooltipBorder,
        textStyle: baseText,
        confine: true,
      };
      const maxValue = Math.max(
        1,
        ...flatMatrix.flatMap((row) => (typeof row[2] === "number" ? [row[2]] : [])),
      );

      switch (visualization.type) {
        case "sankey": {
          const sankey = visualization as AiSankeyVisualization;
          return {
            animation: false,
            textStyle: baseText,
            tooltip,
            series: [
              {
                type: "sankey",
                data: sankey.nodes,
                links: sankey.links,
                left: 10,
                right: 10,
                top: 20,
                bottom: 20,
                emphasis: { focus: "adjacency" },
                lineStyle: { color: "gradient", opacity: 0.4 },
                label: { color: theme.mutedColor, fontSize: 11 },
              },
            ],
          };
        }
        case "heatmap": {
          const heat = visualization as AiHeatmapVisualization;
          return {
            animation: false,
            textStyle: baseText,
            tooltip,
            grid: { left: 50, right: 20, top: 24, bottom: 48 },
            xAxis: {
              type: "category",
              data: heat.xAxis,
              axisLabel,
              nameTextStyle: axisLabel,
            },
            yAxis: { type: "category", data: heat.yAxis, axisLabel, nameTextStyle: axisLabel },
            visualMap: {
              min: 0,
              max: maxValue,
              calculable: true,
              orient: "horizontal",
              left: "center",
              bottom: 0,
              textStyle: axisLabel,
              inRange: { color: [theme.gridColor, theme.primaryColor] },
            },
            series: [
              {
                type: "heatmap",
                data: flatMatrix,
                label: {
                  show: showLabels,
                  color: theme.textColor,
                  fontSize: 10,
                },
                emphasis: {
                  itemStyle: { borderColor: theme.textColor, borderWidth: 1 },
                },
              },
            ],
          };
        }
        case "radar": {
          const radar = visualization as AiRadarVisualization;
          return {
            animation: false,
            textStyle: baseText,
            tooltip,
            radar: {
              indicator: radar.indicators.map((i) => ({ name: i.name, max: i.max ?? 100 })),
              axisName: { color: theme.textColor },
              splitLine: { lineStyle: { color: theme.gridColor } },
            },
            series: [
              {
                type: "radar",
                symbolSize: 4,
                data: radar.series.map((s, i) => ({
                  name: s.name ?? `Series ${i + 1}`,
                  value: s.values,
                })),
                label: {
                  show: showLabels,
                  color: theme.textColor,
                  fontSize: 10,
                },
              },
            ],
          };
        }
        case "scatter": {
          const scatter = visualization as AiScatterVisualization;
          return {
            animation: false,
            textStyle: baseText,
            tooltip,
            grid: { bottom: scatter.x_label ? 48 : undefined, left: scatter.y_label ? 64 : undefined, containLabel: true },
            xAxis: {
              axisLabel,
              splitLine,
              name: scatter.x_label,
              nameLocation: "middle",
              nameGap: 30,
              nameTextStyle: axisLabel,
            },
            yAxis: {
              axisLabel,
              splitLine,
              name: scatter.y_label,
              nameLocation: "middle",
              nameGap: 48,
              nameTextStyle: axisLabel,
            },
            series: [
              {
                type: "scatter",
                symbolSize: 10,
                itemStyle: { color: theme.seriesColors[0] ?? theme.primaryColor },
                data: scatter.points.map((p, i) => ({
                  value: [p.x, p.y],
                  name: p.label ?? `Point ${i + 1}`,
                })),
              },
            ],
          };
        }
        default:
          return { textStyle: baseText };
      }
    },
    [visualization, theme, showLabels, flatMatrix],
  );

  const handleClick = (params: unknown) => {
    if (!onAskFollowUp || (visualization.type !== "scatter" && visualization.type !== "heatmap")) return;
    const p = params as ClickParams;
    let suggestion: string | undefined;
    if (visualization.type === "scatter") {
      const scatter = visualization as AiScatterVisualization;
      const point = scatter.points[p.dataIndex ?? -1];
      if (point) {
        suggestion = `Explain the point ${point.label ?? "this data point"} (${fmtNumber(point.x)}, ${fmtNumber(point.y)}) in the "${title}" scatter chart.`;
      }
    } else if (visualization.type === "heatmap") {
      const heat = visualization as AiHeatmapVisualization;
      const cell = flatMatrix[p.dataIndex ?? -1];
      if (cell) {
        suggestion = `Explain the ${heat.xAxis[cell[0]]} × ${heat.yAxis[cell[1]]} cell (${fmtNumber(cell[2])}) in the "${title}" heatmap.`;
      }
    }
    if (suggestion) {
      setSuggestion(suggestion);
    }
  };

  const hasClicks = visualization.type === "scatter" || visualization.type === "heatmap";
  const onEvents = hasClicks ? { click: handleClick } : undefined;

  const backgroundColor = cssVarToColor("--background", "#ffffff");

  const renderChart = (height: number) => (
    <ReactECharts
      ref={chartRef}
      option={option}
      notMerge
      style={{ height, width: "100%" }}
      onEvents={onEvents}
    />
  );

  return (
    <VisualizationCard
      title={title}
      showLabels={supportsLabels ? showLabels : undefined}
      onToggleLabels={supportsLabels ? () => setShowLabels((v) => !v) : undefined}
      onDownloadPng={() => {
        const instance: EChartsType | null = chartRef.current?.getEchartsInstance() ?? null;
        return downloadEchartsPng(
          (opts) => (instance ? instance.getDataURL(opts) : ""),
          `${filename}.png`,
          backgroundColor,
        );
      }}
      modal={renderChart(420)}
      footer={
        onAskFollowUp ? (
          <ChartFollowUp
            contextText={contextText}
            suggestion={suggestion}
            onAsk={(text) => {
              setSuggestion("");
              onAskFollowUp(text);
            }}
          />
        ) : undefined
      }
    >
      {renderChart(280)}
    </VisualizationCard>
  );
}