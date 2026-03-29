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
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall score</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatScore(overallScore)}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {perspectiveScores.map((score) => (
          <button
            key={score.perspectiveLevel}
            type="button"
            className="text-left"
            onClick={() => onSelect(score.perspectiveLevel)}
            aria-label={`Open ${score.perspectiveLabel} details`}
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-sm">
                  {score.perspectiveLabel}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">
                  {formatScore(score.weightedScore)}
                </div>
                <p className="text-xs text-muted-foreground">
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
