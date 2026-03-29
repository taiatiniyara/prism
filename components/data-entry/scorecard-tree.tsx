import type { ScorecardInputRow } from "@/app/data-entry/balanced-scorecard/types";
import { formatScore } from "@/app/data-entry/balanced-scorecard/formatters";
import ScorecardStatusBadge from "@/components/data-entry/scorecard-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TreeNode = {
  level: number;
  label: string;
  rows: ScorecardInputRow[];
};

const getPerspectiveOrder = (level: number): number => {
  switch (level) {
    case 1:
      return 0;
    case 2:
      return 1;
    case 3:
      return 2;
    case 4:
      return 3;
    default:
      return 4;
  }
};

const formatValue = (value: number | null): string => {
  if (value == null || Number.isNaN(value)) {
    return "N/A";
  }

  return value.toLocaleString();
};

const toDisplayName = (row: ScorecardInputRow): string =>
  row.kpiName?.trim() || `KPI #${row.kpiDefinitionId}`;

export default function ScorecardTree({ rows }: { rows: ScorecardInputRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-sm">BSC Tree</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2 text-xs text-muted-foreground">
          No KPI nodes are available for the selected filter context.
        </CardContent>
      </Card>
    );
  }

  const grouped = rows.reduce<Map<number, TreeNode>>((acc, row) => {
    const existing = acc.get(row.perspectiveLevel);

    if (existing) {
      existing.rows.push(row);
      return acc;
    }

    acc.set(row.perspectiveLevel, {
      level: row.perspectiveLevel,
      label: row.perspectiveLabel,
      rows: [row],
    });

    return acc;
  }, new Map());

  const perspectives = [...grouped.values()].sort(
    (a, b) => getPerspectiveOrder(a.level) - getPerspectiveOrder(b.level),
  );

  return (
    <Card>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-sm">BSC Tree</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-3 pb-2">
        <ul className="space-y-2">
          {perspectives.map((perspective) => (
            <li key={perspective.level}>
              <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs font-semibold">
                {perspective.label} (
                {formatScore(
                  perspective.rows.reduce((sum, row) => {
                    if (
                      row.actualValue == null ||
                      row.targetValue == null ||
                      row.targetValue === 0
                    ) {
                      return sum;
                    }
                    return sum + (row.actualValue / row.targetValue) * 100;
                  }, 0) /
                    Math.max(
                      perspective.rows.filter(
                        (row) =>
                          row.actualValue != null &&
                          row.targetValue != null &&
                          row.targetValue !== 0,
                      ).length,
                      1,
                    ),
                )}
                )
              </div>

              <ul className="mt-1.5 space-y-1.5 border-l pl-3">
                {perspective.rows
                  .slice()
                  .sort((a, b) =>
                    toDisplayName(a).localeCompare(toDisplayName(b)),
                  )
                  .map((row) => (
                    <li
                      key={`${row.kpiId}:${row.kpiDefinitionId}`}
                      className="rounded-md border p-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="text-xs font-medium">{toDisplayName(row)}</div>
                        {row.status === "on_track" ||
                        row.status === "at_risk" ||
                        row.status === "off_track" ? (
                          <ScorecardStatusBadge status={row.status} />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            Status N/A
                          </span>
                        )}
                      </div>

                      {row.objective ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Objective: {row.objective}
                        </p>
                      ) : null}

                      <div className="mt-1.5 grid gap-1.5 text-[11px] sm:grid-cols-3">
                        <div>
                          <span className="font-medium">Target:</span>{" "}
                          {formatValue(row.targetValue)}
                        </div>
                        <div>
                          <span className="font-medium">Actual:</span>{" "}
                          {formatValue(row.actualValue)}
                        </div>
                        <div>
                          <span className="font-medium">KPI ID:</span>{" "}
                          {row.kpiDefinitionId}
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
