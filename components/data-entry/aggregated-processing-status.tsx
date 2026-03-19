"use client";

import { useEffect, useMemo, useState } from "react";

import { AggregatedOutcomeBadge } from "@/components/data-entry/aggregated-outcome-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AggregatedRunSummary {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed";
  calculated: number;
  skipped: number;
}

interface AggregatedProcessingStatusProps {
  reportPeriodId: number | null;
  serviceAreaId: number | null;
}

const POLL_INTERVAL_MS = 6000;

export function AggregatedProcessingStatus({
  reportPeriodId,
  serviceAreaId,
}: AggregatedProcessingStatusProps) {
  const [latestRun, setLatestRun] = useState<AggregatedRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    if (reportPeriodId == null) {
      return null;
    }

    const params = new URLSearchParams({
      reportPeriodId: String(reportPeriodId),
    });

    if (serviceAreaId != null) {
      params.set("serviceAreaId", String(serviceAreaId));
    }

    return params.toString();
  }, [reportPeriodId, serviceAreaId]);

  useEffect(() => {
    if (!query) {
      setLatestRun(null);
      return;
    }

    let active = true;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/data-entry/aggregated-runs?${query}`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("Unable to load aggregated run status.");
        }

        const runs = (await response.json()) as AggregatedRunSummary[];
        if (!active) {
          return;
        }

        setLatestRun(runs[0] ?? null);
        setError(null);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load aggregated run status.",
        );
      }
    };

    void load();
    const interval = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [query]);

  if (reportPeriodId == null) {
    return null;
  }

  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle className="text-sm">Aggregated Formula Processing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {error ? <p className="text-red-600">{error}</p> : null}
        {!latestRun ? (
          <p className="text-muted-foreground">
            No processing runs found for this filter context.
          </p>
        ) : (
          <>
            <p>
              Latest run: <strong>{latestRun.status}</strong>
            </p>
            <div className="flex items-center gap-2">
              <AggregatedOutcomeBadge status="calculated" />
              <span>{latestRun.calculated}</span>
              <AggregatedOutcomeBadge status="skipped" />
              <span>{latestRun.skipped}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              {latestRun.completedAt
                ? `Completed at ${new Date(latestRun.completedAt).toLocaleTimeString()}`
                : `Started at ${new Date(latestRun.startedAt).toLocaleTimeString()}`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
