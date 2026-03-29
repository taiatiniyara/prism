"use client";

import { useEffect, useMemo, useState } from "react";
import ScorecardSummary from "@/components/data-entry/scorecard-summary";
import ScorecardDetailPanel from "@/components/data-entry/scorecard-detail-panel";
import ScorecardEmptyState from "@/components/data-entry/scorecard-empty-state";
import ScorecardTree from "@/components/data-entry/scorecard-tree";
import ScorecardFiltersClient from "@/app/data-entry/balanced-scorecard/filters.client";
import {
  fetchScorecard,
  fetchScorecardKpiOptions,
  isLatestRequest,
  saveScorecardConfig,
} from "@/app/data-entry/balanced-scorecard/client";
import type {
  ScorecardFilterContext,
  ScorecardInputRow,
  ScorecardKpiOption,
  ScorecardSnapshot,
} from "@/app/data-entry/balanced-scorecard/types";
import type { ReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ScorecardPageClient({
  initialContext,
  options,
  kpiOptions,
}: {
  initialContext: ScorecardFilterContext;
  options: ReviewKpiFilterOptions;
  kpiOptions: ScorecardKpiOption[];
}) {
  const [context, setContext] =
    useState<ScorecardFilterContext>(initialContext);
  const [snapshot, setSnapshot] = useState<ScorecardSnapshot | null>(null);
  const [scorecardRows, setScorecardRows] = useState<ScorecardInputRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedPerspective, setSelectedPerspective] = useState<number | null>(
    null,
  );
  const [availableKpiOptions, setAvailableKpiOptions] =
    useState<ScorecardKpiOption[]>(kpiOptions);
  const [kpiDefinitionId, setKpiDefinitionId] = useState<number | null>(
    kpiOptions[0]?.kpiDefinitionId ?? null,
  );
  const [perspectiveLevel, setPerspectiveLevel] = useState<1 | 2 | 3 | 4>(1);
  const [objective, setObjective] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetYear, setTargetYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [targetMonth, setTargetMonth] = useState<string>("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchScorecard(context)
      .then(({ requestId, payload }) => {
        if (!active || !isLatestRequest(requestId)) {
          return;
        }
        setSnapshot(payload.snapshot);
        setScorecardRows(payload.rows ?? []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) {
          return;
        }
        setSnapshot(null);
        setScorecardRows([]);
        setError(
          err instanceof Error ? err.message : "Unable to load scorecard.",
        );
      });

    return () => {
      active = false;
    };
  }, [context]);

  useEffect(() => {
    let active = true;

    void fetchScorecardKpiOptions(context)
      .then((nextOptions) => {
        if (!active) {
          return;
        }

        setAvailableKpiOptions(nextOptions);
        setKpiDefinitionId((current) => {
          if (
            current != null &&
            nextOptions.some((option) => option.kpiDefinitionId === current)
          ) {
            return current;
          }

          return nextOptions[0]?.kpiDefinitionId ?? null;
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setAvailableKpiOptions([]);
        setKpiDefinitionId(null);
      });

    return () => {
      active = false;
    };
  }, [context]);

  const selected = useMemo(
    () =>
      snapshot?.perspectiveScores.find(
        (item) => item.perspectiveLevel === selectedPerspective,
      ) ?? null,
    [snapshot, selectedPerspective],
  );

  const selectedKpiOption = useMemo(
    () =>
      kpiDefinitionId == null
        ? null
        : (availableKpiOptions.find(
            (option) => option.kpiDefinitionId === kpiDefinitionId,
          ) ?? null),
    [availableKpiOptions, kpiDefinitionId],
  );

  return (
    <div className="space-y-2 p-1.5 sm:p-2">
      <ScorecardFiltersClient
        context={context}
        options={options}
        onChange={(next) => {
          setSnapshot(null);
          setError(null);
          setContext(next);
        }}
      />

      {!snapshot && !error ? (
        <div className="text-xs text-muted-foreground">
          Loading scorecard...
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="rounded-md border bg-card p-2">
        <h2 className="text-xs font-semibold">Enter or Update KPI Target</h2>
        <p className="text-[11px] text-muted-foreground">
          Update KPI perspective, objective, and target by year, or by year and
          month.
        </p>

        <div className="mt-2 grid gap-1.5 md:grid-cols-2">
          <div className="space-y-0.5">
            <label className="text-[11px] font-medium">KPI</label>
            <Select
              value={
                kpiDefinitionId == null ? undefined : String(kpiDefinitionId)
              }
              onValueChange={(value) => setKpiDefinitionId(Number(value))}
              disabled={availableKpiOptions.length === 0 || isSaving}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select KPI" />
              </SelectTrigger>
              <SelectContent>
                {availableKpiOptions.map((option) => (
                  <SelectItem
                    key={option.kpiDefinitionId}
                    value={String(option.kpiDefinitionId)}
                  >
                    {option.kpiName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-0.5">
            <label className="text-[11px] font-medium">Perspective</label>
            <Select
              value={String(perspectiveLevel)}
              onValueChange={(value) =>
                setPerspectiveLevel(Number(value) as 1 | 2 | 3 | 4)
              }
              disabled={isSaving}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select perspective" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Financial</SelectItem>
                <SelectItem value="2">Customer</SelectItem>
                <SelectItem value="3">Operation</SelectItem>
                <SelectItem value="4">Development</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-0.5 md:col-span-2">
            <label className="text-[11px] font-medium">Objective</label>
            <Input
              name="objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              className="h-8 text-xs"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-0.5">
            <label className="text-[11px] font-medium">Target Value</label>
            <Input
              name="targetValue"
              value={targetValue}
              onChange={(event) => setTargetValue(event.target.value)}
              className="h-8 text-xs"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-0.5">
            <label className="text-[11px] font-medium">Year</label>
            <Input
              name="targetYear"
              type="number"
              min={1900}
              max={3000}
              value={String(targetYear)}
              onChange={(event) =>
                setTargetYear(Number(event.target.value || "0"))
              }
              className="h-8 text-xs"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-0.5">
            <label className="text-[11px] font-medium">Month (optional)</label>
            <Input
              name="targetMonth"
              type="number"
              min={1}
              max={12}
              value={targetMonth}
              onChange={(event) => setTargetMonth(event.target.value)}
              className="h-8 text-xs"
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={
              isSaving ||
              availableKpiOptions.length === 0 ||
              selectedKpiOption == null
            }
            onClick={async () => {
              setSaveMessage(null);
              setIsSaving(true);

              try {
                if (selectedKpiOption == null) {
                  throw new Error("Select a KPI first.");
                }

                await saveScorecardConfig({
                  kpiId: selectedKpiOption.kpiId,
                  kpiDefinitionId: selectedKpiOption.kpiDefinitionId,
                  perspectiveLevel,
                  objective,
                  target: {
                    year: targetYear,
                    month:
                      targetMonth.trim().length > 0
                        ? Number(targetMonth)
                        : null,
                    targetValue,
                  },
                });

                setSaveMessage("KPI target saved successfully.");
                setContext((current) => ({ ...current }));
              } catch (err) {
                setSaveMessage(
                  err instanceof Error
                    ? err.message
                    : "Unable to save KPI target.",
                );
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving ? "Saving..." : "Save KPI Target"}
          </Button>
          {saveMessage ? (
            <span className="text-[11px] text-muted-foreground">{saveMessage}</span>
          ) : null}
        </div>

        {availableKpiOptions.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No KPI options available for this filter context.
          </p>
        ) : null}
      </section>

      {snapshot && snapshot.perspectiveScores.length > 0 ? (
        <>
          <ScorecardTree rows={scorecardRows} />
          <ScorecardSummary
            overallScore={snapshot.overallScore}
            perspectiveScores={snapshot.perspectiveScores}
            onSelect={setSelectedPerspective}
          />
          <ScorecardDetailPanel perspective={selected} />
        </>
      ) : null}

      {!error && snapshot && snapshot.perspectiveScores.length === 0 ? (
        <ScorecardEmptyState />
      ) : null}
    </div>
  );
}
