import type { PerspectiveScore } from "@/app/data-entry/balanced-scorecard/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatScore } from "@/app/data-entry/balanced-scorecard/formatters";

export default function ScorecardSummary({
  overallScore,
  perspectiveScores,
  onSelect,
}: {
  overallScore: number | null;
  perspectiveScores: PerspectiveScore[];
  onSelect: (level: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Card>
        <CardHeader className="px-3 py-2">
          <CardTitle className="text-sm">Overall score</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-2 text-xl font-semibold">
          {formatScore(overallScore)}
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {perspectiveScores.map((score) => (
          <button
            key={score.perspectiveLevel}
            type="button"
            className="text-left"
            onClick={() => onSelect(score.perspectiveLevel)}
            aria-label={`Open ${score.perspectiveLabel} details`}
          >
            <Card className="h-full">
              <CardHeader className="px-3 py-2">
                <CardTitle className="text-xs">
                  {score.perspectiveLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2">
                <div className="text-lg font-semibold">
                  {formatScore(score.weightedScore)}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Included {score.includedCount} • Excluded{" "}
                  {score.excludedCount}
                </p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
