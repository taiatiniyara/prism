"use client";

import { useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { normalizeBarChart } from "@/lib/ai/visualization";
import {
  buildContextText,
  copyToClipboard,
  downloadNodeAsPng,
  fmtNumber,
  rowsToCsv,
  slugifyTitle,
} from "@/lib/ai/visualization-export";
import { ChartFollowUp } from "./chart-follow-up";
import { RawDataFallback } from "./raw-data-fallback";
import { VisualizationCard } from "./visualization-card";
import { useChartTheme } from "./visualization-theme";
import type { AiBarChartVisualization } from "@/lib/ai/types";

const SERIES_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#f97316",
];

interface BarChartViewProps {
  data: AiBarChartVisualization;
  onAskFollowUp?: (text: string) => void;
}

export function BarChartView({ data, onAskFollowUp }: BarChartViewProps) {
  const { title, rows, seriesKeys, unit, colorPositive, colorNegative, referenceLine, referenceArea } =
    normalizeBarChart(data);
  const theme = useChartTheme();
  const [showLabels, setShowLabels] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const captureRef = useRef<HTMLDivElement>(null);

  const hasRawData =
    (Array.isArray(data.data) && data.data.length > 0) ||
    (Array.isArray(data.series) && data.series.length > 0);

  const csv = useMemo(
    () => (rows.length > 0 ? rowsToCsv(rows, seriesKeys) : ""),
    [rows, seriesKeys],
  );
  const contextText = useMemo(
    () => (title ? buildContextText(title, csv) : ""),
    [title, csv],
  );
  const filename = slugifyTitle(title, "bar-chart");
  const singleSeries = seriesKeys.length === 1;
  const isColored = Boolean(colorPositive || colorNegative);

  const handleCellClick = (_entry: unknown, index: number) => {
    const row = rows[index];
    if (!row) return;
    const label = row.label;
    const value = singleSeries ? row[seriesKeys[0]] : undefined;
    setSuggestion(
      `Explain ${label}${value !== undefined ? ` (${fmtNumber(value)}${unit ? ` ${unit}` : ""})` : ""} in the "${title}" bar chart.`,
    );
  };

  const renderChart = (height: number) => (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart data={rows}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={theme.gridColor}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: theme.mutedColor }}
            tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 18)}…` : v)}
          />
          <YAxis
            tick={{ fontSize: 12, fill: theme.mutedColor }}
            tickFormatter={(v: number) => fmtNumber(v)}
            width={56}
          />
          <Tooltip
            cursor={{ fill: theme.gridColor, fillOpacity: 0.1 }}
            formatter={(value) =>
              unit ? `${fmtNumber(Number(value))} ${unit}` : fmtNumber(Number(value))
            }
            contentStyle={{
              backgroundColor: theme.tooltipBg,
              border: `1px solid ${theme.tooltipBorder}`,
              borderRadius: "6px",
              fontSize: "12px",
              color: theme.tooltipText,
            }}
            itemStyle={{ color: theme.tooltipText }}
            labelStyle={{ color: theme.mutedColor }}
          />
          {seriesKeys.map((key, idx) => (
            <Bar
              key={key}
              dataKey={key}
              fill={singleSeries ? "hsl(var(--primary))" : SERIES_COLORS[idx % SERIES_COLORS.length]}
              radius={[4, 4, 0, 0]}
              onClick={singleSeries ? handleCellClick : undefined}
            >
              {showLabels && (
                <LabelList
                  dataKey={key}
                  position="top"
                  formatter={(v) => fmtNumber(v)}
                  style={{ fontSize: 10, fill: theme.mutedColor }}
                />
              )}
              {singleSeries &&
                isColored &&
                rows.map((row, i) => {
                  const value = row[key];
                  const isPositive = typeof value === "number" && value >= 0;
                  return (
                    <Cell
                      key={i}
                      fill={isPositive ? colorPositive : colorNegative}
                      onClick={() => handleCellClick(undefined, i)}
                    />
                  );
                })}
            </Bar>
          ))}
          {referenceLine && (
            <ReferenceLine
              y={referenceLine.value}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{
                value: referenceLine.label,
                position: "insideTopRight",
                fill: "#f59e0b",
                fontSize: 11,
              }}
            />
          )}
          {referenceArea && (
            <ReferenceArea
              y1={referenceArea.lower}
              y2={referenceArea.upper}
              fill="#f59e0b"
              fillOpacity={0.08}
              stroke="none"
              label={{
                value: referenceArea.label,
                position: "insideTopLeft",
                fill: "#f59e0b",
                fontSize: 10,
              }}
            />
          )}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );

  if (rows.length === 0) {
    return (
      <VisualizationCard
        title={title}
        subtitle={data.description}
        onCopyCsv={csv ? () => copyToClipboard(csv) : undefined}
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
        {hasRawData ? <RawDataFallback data={data.data ?? data.series} /> : <RawDataFallback data={null} />}
      </VisualizationCard>
    );
  }

  return (
    <VisualizationCard
      title={title}
      subtitle={data.description}
      showLabels={showLabels}
      onToggleLabels={() => setShowLabels((v) => !v)}
      onCopyCsv={() => copyToClipboard(csv)}
      onDownloadPng={() => {
        if (!captureRef.current) throw new Error("chart not ready");
        return downloadNodeAsPng(captureRef.current, `${filename}.png`);
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
      <div ref={captureRef}>{renderChart(280)}</div>
    </VisualizationCard>
  );
}