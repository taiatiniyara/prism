"use client";

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AiBarChartVisualization } from "@/lib/ai/types";

interface BarChartViewProps {
  data: AiBarChartVisualization;
}

export function BarChartView({ data }: BarChartViewProps) {
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
        <RechartsBarChart data={data.series}>
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
          <Bar
            dataKey="value"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
          />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
