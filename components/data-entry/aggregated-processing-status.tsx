"use client";

import { useEffect, useMemo, useState } from "react";

import { AggregatedOutcomeBadge } from "@/components/data-entry/aggregated-outcome-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KpiWorkerStatusSummary } from "@/app/data-entry/types";

interface AggregatedRunSummary {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  error?: string | null;
  calculated: number;
  skipped: number;
}

interface KpiRunSummary {
  id: string;
  status: KpiWorkerStatusSummary["status"];
  retryCount: number;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface AggregatedProcessingStatusProps {
  reportPeriodId: number | null;
  serviceAreaId: number | null;
  unitId?: number | null;
  mode?: "aggregated" | "kpi";
}

export function AggregatedProcessingStatus({
  reportPeriodId,
  serviceAreaId,
  unitId,
  mode = "aggregated",
}: AggregatedProcessingStatusProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [latestRun, setLatestRun] = useState<AggregatedRunSummary | null>(null);
  const [latestKpiAttempt, setLatestKpiAttempt] =
    useState<KpiRunSummary | null>(null);
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

    if (unitId != null) {
      params.set("unitId", String(unitId));
    }

    return params.toString();
  }, [reportPeriodId, serviceAreaId, unitId]);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!query) {
        setLatestRun(null);
        setLatestKpiAttempt(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(
          mode === "kpi"
            ? `/api/data-entry/kpi-worker/status?${query}`
            : `/api/data-entry/aggregated-runs?${query}`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          let errorMessage: string | null = null;

          try {
            const payload = (await response.json()) as { message?: string };
            errorMessage = payload.message ?? null;
          } catch {
            // Ignore parsing error and fall back to default text.
          }

          throw new Error(
            errorMessage ??
              (mode === "kpi"
                ? "Unable to load KPI run status."
                : "Unable to load aggregated run status."),
          );
        }

        const runs = (await response.json()) as
          | AggregatedRunSummary[]
          | KpiRunSummary[];
        if (!active) {
          return;
        }

        if (mode === "kpi") {
          setLatestKpiAttempt((runs as KpiRunSummary[])[0] ?? null);
          setLatestRun(null);
        } else {
          setLatestRun((runs as AggregatedRunSummary[])[0] ?? null);
          setLatestKpiAttempt(null);
        }
        setError(null);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : mode === "kpi"
              ? "Unable to load KPI run status."
              : "Unable to load aggregated run status.",
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [mode, query]);

  if (reportPeriodId == null) {
    return null;
  }

  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle className="text-sm">
          {mode === "kpi"
            ? "KPI Calculation Processing"
            : "Aggregated Formula Processing"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading ? (
          <p className="text-muted-foreground">Loading latest status...</p>
        ) : null}
        {error ? <p className="text-red-600">{error}</p> : null}

        {mode === "aggregated" && !latestRun && !error && !isLoading ? (
          <p className="text-muted-foreground">
            No processing runs found for this filter context.
          </p>
        ) : null}

        {mode === "aggregated" && latestRun ? (
          <>
            <p>
              Latest run:{" "}
              <strong
                className={
                  latestRun.status === "failed" ? "text-red-600" : ""
                }
              >
                {latestRun.status}
              </strong>
            </p>
            {latestRun.error ? (
              <p className="text-red-600 text-xs">{latestRun.error}</p>
            ) : null}
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
        ) : null}

        {mode === "kpi" && !latestKpiAttempt && !error && !isLoading ? (
          <p className="text-muted-foreground">
            No KPI calculation attempts found for this filter context.
          </p>
        ) : null}

        {mode === "kpi" && latestKpiAttempt ? (
          <>
            <p>
              Latest attempt: <strong>{latestKpiAttempt.status}</strong>
            </p>
            <p className="text-muted-foreground text-xs">
              Retries: {latestKpiAttempt.retryCount}
            </p>
            {latestKpiAttempt.failureReason ? (
              <p className="text-red-600">{latestKpiAttempt.failureReason}</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              {latestKpiAttempt.completedAt
                ? `Completed at ${new Date(latestKpiAttempt.completedAt).toLocaleTimeString()}`
                : latestKpiAttempt.startedAt
                  ? `Started at ${new Date(latestKpiAttempt.startedAt).toLocaleTimeString()}`
                  : "Awaiting processing start."}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
