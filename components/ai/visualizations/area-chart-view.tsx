"use client";

import { useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  Label,
  LabelList,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { normalizeAreaChart } from "@/lib/ai/visualization";
import {
  buildContextText,
  copyToClipboard,
  downloadCsv,
  downloadNodeAsPng,
  fmtNumber,
  rowsToCsv,
  slugifyTitle,
} from "@/lib/ai/visualization-export";
import { ChartFollowUp } from "./chart-follow-up";
import { RawDataFallback } from "./raw-data-fallback";
import { VisualizationCard } from "./visualization-card";
import { useChartTheme } from "./visualization-theme";
import type { AiAreaChartVisualization } from "@/lib/ai/types";

interface AreaChartViewProps {
  data: AiAreaChartVisualization;
  onAskFollowUp?: (text: string) => void;
}

export function AreaChartView({ data, onAskFollowUp }: AreaChartViewProps) {
  const { title, rows, seriesKeys, unit, referenceLine, referenceArea } = normalizeAreaChart(data);
  const theme = useChartTheme();
  const [showLabels, setShowLabels] = useState(false);
  const xAxisTitle = data.x_label?.trim() || undefined;
  const yAxisTitle =
    [data.y_label?.trim(), unit ? `(${unit})` : ""].filter(Boolean).join(" ") ||
    undefined;
  const [suggestion, setSuggestion] = useState("");
  const captureRef = useRef<HTMLDivElement>(null);

  // Stacking only makes sense for multiple additive series; a single area is
  // always a filled trend. Overlapping (non-stacked) multi-series areas read as
  // lines with light fills so overlaps stay legible.
  const stacked = data.stacked === true && seriesKeys.length > 1;
  const singleSeries = seriesKeys.length === 1;
  const fillOpacity = stacked ? 0.85 : singleSeries ? 0.7 : 0.18;

  const gradientId = useMemo(
    () => `area-grad-${slugifyTitle(title, "chart")}`,
    [title],
  );

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
  const filename = slugifyTitle(title, "area-chart");

  const handlePointClick = (state: { activeLabel?: unknown; activePayload?: Array<{ value?: unknown }> }) => {
    const label = state.activeLabel ?? "";
    const value = state.activePayload?.[0]?.value;
    setSuggestion(
      `Explain ${label}${value !== undefined ? ` (${fmtNumber(value)}${unit ? ` ${unit}` : ""})` : ""} in the "${title}" area chart.`,
    );
  };

  const renderChart = (height: number) => (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart
          data={rows}
          onClick={singleSeries ? handlePointClick : undefined}
          margin={{
            top: 8,
            right: 16,
            bottom: xAxisTitle ? 24 : 4,
            left: yAxisTitle ? 12 : 0,
          }}
        >
          <defs>
            {seriesKeys.map((key, idx) => {
              const color = theme.seriesColors[idx % theme.seriesColors.length];
              return (
                <linearGradient key={key} id={`${gradientId}-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
                  <stop offset="100%" stopColor={color} stopOpacity={stacked ? 0.15 : 0.02} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={theme.gridColor}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: theme.mutedColor }}
            tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 18)}…` : v)}
            height={xAxisTitle ? 44 : 30}
          >
            {xAxisTitle && (
              <Label
                value={xAxisTitle}
                position="insideBottom"
                offset={-2}
                style={{ fontSize: 12, fill: theme.mutedColor, textAnchor: "middle" }}
              />
            )}
          </XAxis>
          <YAxis
            tick={{ fontSize: 12, fill: theme.mutedColor }}
            tickFormatter={(v: number) => fmtNumber(v)}
            width={yAxisTitle ? 72 : 56}
          >
            {yAxisTitle && (
              <Label
                value={yAxisTitle}
                angle={-90}
                position="insideLeft"
                style={{ fontSize: 12, fill: theme.mutedColor, textAnchor: "middle" }}
              />
            )}
          </YAxis>
          <Tooltip
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
          {!singleSeries && (
            <Legend
              verticalAlign="top"
              height={28}
              content={() => (
                <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 p-0 pb-1 m-0 list-none">
                  {seriesKeys.map((key, idx) => (
                    <li key={key} className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ background: theme.seriesColors[idx % theme.seriesColors.length] }}
                      />
                      <span style={{ color: theme.mutedColor, fontSize: 12 }}>{key}</span>
                    </li>
                  ))}
                </ul>
              )}
            />
          )}
          {seriesKeys.map((key, idx) => {
            const color = theme.seriesColors[idx % theme.seriesColors.length];
            return (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId={stacked ? "stack" : undefined}
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId}-${idx})`}
                fillOpacity={1}
                dot={singleSeries ? { r: 3, fill: color, strokeWidth: 0 } : false}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              >
                {showLabels && singleSeries && (
                  <LabelList
                    dataKey={key}
                    position="top"
                    formatter={(v) => fmtNumber(v)}
                    style={{ fontSize: 10, fill: theme.mutedColor }}
                  />
                )}
              </Area>
            );
          })}
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
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );

  if (rows.length === 0) {
    return (
      <VisualizationCard
        title={title}
        subtitle={data.description}
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
      onToggleLabels={singleSeries ? () => setShowLabels((v) => !v) : undefined}
      onCopyCsv={() => copyToClipboard(csv)}
      onDownloadCsv={csv ? () => downloadCsv(`${filename}.csv`, csv) : undefined}
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
