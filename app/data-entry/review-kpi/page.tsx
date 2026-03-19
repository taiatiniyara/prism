import { listAggregatedRuns } from "@/app/data-entry/enter-data/services/aggregated-worker/review-service";
import { AggregatedOutcomeBadge } from "@/components/data-entry/aggregated-outcome-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ReviewKPIPage() {
  const runs = listAggregatedRuns({}).slice(0, 20);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Aggregated Formula Run Review</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No aggregated formula runs have been recorded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.runId}
                  className="rounded-md border p-3 text-sm flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      Run {run.runId.slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <AggregatedOutcomeBadge status="calculated" />
                    <span>{run.calculated}</span>
                    <AggregatedOutcomeBadge status="skipped" />
                    <span>{run.skipped}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
