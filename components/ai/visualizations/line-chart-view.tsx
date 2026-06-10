"use client";

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AiLineChartVisualization } from "@/lib/ai/types";

interface LineChartViewProps {
  data: AiLineChartVisualization;
}

export function LineChartView({ data }: LineChartViewProps) {
  if (!data.series?.length) {
    return (
      <div className="border-border rounded-md border p-4 text-center text-sm text-muted-foreground dark:border-border dark:text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="border-border rounded-md border p-4 dark:border-border">
      <h4 className="mb-3 text-sm font-medium dark:text-foreground">{data.title}</h4>
      <ResponsiveContainer width="100%" height={250}>
        <RechartsLineChart data={data.series}>
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
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--primary))", r: 4 }}
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}
