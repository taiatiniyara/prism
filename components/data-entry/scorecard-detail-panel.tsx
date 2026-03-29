import type { PerspectiveScore } from "@/app/data-entry/balanced-scorecard/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatScore } from "@/app/data-entry/balanced-scorecard/formatters";

export default function ScorecardDetailPanel({
  perspective,
}: {
  perspective: PerspectiveScore | null;
}) {
  if (perspective == null) {
    return (
      <div className="rounded-md border p-2 text-xs text-muted-foreground">
        Select a perspective to inspect score drivers.
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-sm">
          {perspective.perspectiveLabel} details (
          {formatScore(perspective.weightedScore)})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-2 text-xs">
        <div>
          <p>Included rows: {perspective.includedCount}</p>
          <p>Excluded rows: {perspective.excludedCount}</p>
        </div>

        <div>
          <h4 className="mb-1 font-medium text-xs">Excluded reasons</h4>
          {perspective.exclusions.length === 0 ? (
            <p className="text-muted-foreground">No exclusions.</p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-4">
              {perspective.exclusions.map((item) => (
                <li key={`${item.kpiId}:${item.reasonCode}`}>
                  {item.reasonCode}: {item.reasonMessage}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
