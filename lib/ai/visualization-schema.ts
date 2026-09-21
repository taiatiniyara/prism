import { z } from "zod";

/**
 * Strict, self-documenting input schema for the `render_visualization` tool.
 *
 * The previous schema was `{ type, title }.passthrough()` — the model had to
 * guess every other field (data shape, axis labels, units), so charts came out
 * empty, mislabelled, or the wrong type. This mandates the data for each chart
 * type (so a chart can never render empty) and describes every field so the
 * model supplies correct labels and units. Shapes match `lib/ai/visualization.ts`
 * normalizers exactly, so a valid spec always renders.
 */

const labelValue = z.object({
  label: z
    .string()
    .describe("Category for this point — the x-axis label (e.g. a utility acronym, a year, a KPI name)."),
  value: z.number().describe("The numeric value for this category."),
});

const referenceLine = z
  .object({
    label: z.string().optional().describe("Caption, e.g. 'PPA target' or 'Benchmark'."),
    value: z.number().describe("Y-axis value at which to draw the line."),
  })
  .describe(
    "Optional horizontal reference line. Use it for a target or benchmark (e.g. the PPA target) so performance is read against it.",
  );

const tableViz = z.object({
  type: z.literal("table"),
  title: z.string().describe("Specific title naming the metric and scope, e.g. 'Financial summary — Tonga Power FY2024'."),
  columns: z
    .array(z.string())
    .min(1)
    .describe("Ordered column headers. Put the unit in the header where relevant, e.g. 'SAIDI (min)'."),
  rows: z
    .array(z.array(z.union([z.string(), z.number(), z.null()])))
    .min(1)
    .describe("Rows aligned to `columns`. Use null for a missing cell — never fabricate a value."),
});

const barChartViz = z.object({
  type: z.literal("bar-chart"),
  title: z.string().describe("Specific title, e.g. 'SAIDI by utility — FY2024'."),
  series: z
    .array(labelValue)
    .min(1)
    .describe(
      "One bar per entry: {label, value}. Use to compare ONE metric across categories (utilities, periods, technologies). Order meaningfully — usually descending by value.",
    ),
  x_label: z.string().optional().describe("X-axis title — what the bars are (e.g. 'Utility'). Always provide."),
  y_label: z.string().optional().describe("Y-axis title — what the values measure (e.g. 'SAIDI'). Always provide."),
  unit: z.string().optional().describe("Unit of the values, e.g. 'min', 'MWh', '%', 'FJD'. Provide whenever known."),
  reference_line: referenceLine.optional(),
  color_positive: z.string().optional().describe("Hex colour for normal bars (optional; theme default otherwise)."),
  color_negative: z.string().optional().describe("Hex colour for negative-value bars (optional)."),
  description: z.string().optional().describe("One-line plain-English takeaway shown under the chart."),
});

const lineChartViz = z.object({
  type: z.literal("line-chart"),
  title: z.string().describe("Specific title, e.g. 'SAIDI trend — Tonga Power'."),
  series: z
    .union([
      z.array(labelValue).describe("Single line: one {label, value} per point, label = the period/year."),
      z
        .array(
          z.object({
            name: z.string().describe("Line name, e.g. the utility."),
            data: z.array(labelValue).describe("Points for this line: {label = x (period), value = y}."),
          }),
        )
        .describe("Multiple lines: one entry per line, each with its own points."),
    ])
    .describe("Use line-chart for trends across ordered periods/time."),
  x_label: z.string().optional().describe("X-axis title, e.g. 'Financial year'. Always provide."),
  y_label: z.string().optional().describe("Y-axis title — the metric. Always provide."),
  unit: z.string().optional().describe("Unit of the values. Provide whenever known."),
  reference_line: referenceLine.optional(),
  description: z.string().optional().describe("One-line takeaway."),
});

const leaderboardViz = z.object({
  type: z.literal("leaderboard"),
  title: z.string().describe("e.g. 'Top utilities by SAIDI — FY2024'."),
  items: z
    .array(
      z.object({
        label: z.string().describe("Entrant, e.g. a utility name."),
        value: z.number().describe("Ranking value."),
        unit: z.string().optional().describe("Unit for this value, e.g. 'min'."),
      }),
    )
    .min(1)
    .describe(
      "Ranked entries, ordered best→worst for the metric. Prefer this for 'top/bottom performing' questions — it reads more clearly than a bar chart for rankings.",
    ),
});

const sankeyViz = z.object({
  type: z.literal("sankey"),
  title: z.string(),
  nodes: z.array(z.object({ name: z.string() })).min(1).describe("Unique node names."),
  links: z
    .array(
      z.object({
        source: z.string().describe("Source node name (must match a node)."),
        target: z.string().describe("Target node name (must match a node)."),
        value: z.number().describe("Flow magnitude."),
      }),
    )
    .min(1)
    .describe("Flows between nodes. Use for energy-mix or financial flow breakdowns."),
});

const heatmapViz = z.object({
  type: z.literal("heatmap"),
  title: z.string(),
  xAxis: z.array(z.string()).min(1).describe("X-axis category labels."),
  yAxis: z.array(z.string()).min(1).describe("Y-axis category labels."),
  values: z.array(z.array(z.number())).min(1).describe("Matrix of values, indexed [yIndex][xIndex]."),
});

const radarViz = z.object({
  type: z.literal("radar"),
  title: z.string(),
  indicators: z
    .array(z.object({ name: z.string().describe("Axis name."), max: z.number().describe("Max scale for this axis.") }))
    .min(3)
    .describe("At least 3 axes. Use to profile one or few entities across several metrics."),
  series: z
    .array(
      z.object({
        name: z.string().describe("Series name, e.g. a utility."),
        values: z.array(z.number()).describe("One value per indicator, in the same order as `indicators`."),
      }),
    )
    .min(1),
});

const scatterViz = z.object({
  type: z.literal("scatter"),
  title: z.string(),
  points: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        label: z.string().optional().describe("Point label, e.g. the utility."),
      }),
    )
    .min(1)
    .describe("Points. Use to show correlation between two metrics."),
  x_label: z.string().optional().describe("X-axis metric name + unit. Always provide."),
  y_label: z.string().optional().describe("Y-axis metric name + unit. Always provide."),
});

export const visualizationInputSchema = z
  .discriminatedUnion("type", [
    tableViz,
    barChartViz,
    lineChartViz,
    leaderboardViz,
    sankeyViz,
    heatmapViz,
    radarViz,
    scatterViz,
  ])
  .describe(
    "A single visualization. Pick the type that fits the data: leaderboard for rankings; bar-chart to compare one metric across categories; line-chart for trends over periods; scatter for correlation between two metrics; table for detailed multi-column data; radar to profile an entity across metrics; sankey/heatmap for flows/matrices.",
  );
