"use client";

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { normalizeBarChart } from "@/lib/ai/visualization";
import type { AiBarChartVisualization } from "@/lib/ai/types";

interface BarChartViewProps {
  data: AiBarChartVisualization;
}

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

export function BarChartView({ data }: BarChartViewProps) {
  const { title, rows, seriesKeys, colorPositive, colorNegative, referenceLine } = normalizeBarChart(data);
  const singleSeries = seriesKeys.length === 1;
  const isColored = Boolean(colorPositive || colorNegative);

  if (rows.length === 0) {
    return (
      <div className="border-border rounded-md border p-4 text-center text-sm text-muted-foreground dark:border-border dark:text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="border-border rounded-md border p-4 dark:border-border">
      <h4 className="mb-3 text-sm font-medium dark:text-foreground">{title}</h4>
      <ResponsiveContainer width="100%" height={250}>
        <RechartsBarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted dark:stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            className="text-muted-foreground dark:text-muted-foreground"
            tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 18) + "..." : v}
          />
          <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground dark:text-muted-foreground" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          {seriesKeys.map((key, idx) => (
            <Bar
              key={key}
              dataKey={key}
              fill={singleSeries ? "hsl(var(--primary))" : SERIES_COLORS[idx % SERIES_COLORS.length]}
              radius={[4, 4, 0, 0]}
            >
              {singleSeries && isColored &&
                rows.map((row, i) => {
                  const value = row[key];
                  const isPositive = typeof value === "number" && value >= 0;
                  return (
                    <Cell
                      key={i}
                      fill={isPositive ? colorPositive : colorNegative}
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
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}