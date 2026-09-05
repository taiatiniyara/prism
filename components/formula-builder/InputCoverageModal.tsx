"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getPeriodInputCoverage,
  type InputCoverage,
  type PeriodInputCoverage,
} from "@/app/settings/kpi/input-coverage-service";

export interface InputCoverageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerKind: "kpi" | "measure";
  ownerId: number | null;
  reportPeriodId: number | null;
  ownerName?: string;
}

/**
 * Per-unit input coverage for one (owner × report period): for every input
 * measure, which generators (units) have the value entered vs. which are blank.
 * Answers "which specific generator is missing rated_capacity / planned
 * downtime" — including the silent case where SOME units are blank but the
 * aggregate still computed.
 */
export function InputCoverageModal({
  open,
  onOpenChange,
  ownerKind,
  ownerId,
  reportPeriodId,
  ownerName,
}: InputCoverageModalProps) {
  const [data, setData] = useState<PeriodInputCoverage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || ownerId == null || reportPeriodId == null) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await getPeriodInputCoverage({
          ownerKind,
          ownerId,
          reportPeriodId,
        });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load coverage.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ownerKind, ownerId, reportPeriodId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Input coverage by generator</DialogTitle>
          <DialogDescription>
            {ownerName ? <b className="text-foreground">{ownerName}</b> : "This calculation"}
            {data?.utilityName ? <> · {data.utilityName}</> : null}
            {reportPeriodId != null ? <> · period {reportPeriodId}</> : null} —
            which units have each input entered vs. missing.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-3 overflow-auto pr-1">
          {loading && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Loading coverage…
            </p>
          )}
          {error && (
            <p className="text-destructive py-8 text-center text-sm">{error}</p>
          )}
          {!loading && !error && data && data.inputs.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              This calculation has no bound inputs.
            </p>
          )}
          {!loading &&
            !error &&
            data?.inputs.map((input) => (
              <CoverageCard key={input.measureDefId} input={input} />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CoverageCard({ input }: { input: InputCoverage }) {
  const {
    measureName,
    variableNames,
    perUnit,
    totalUnits,
    enteredUnits,
    missingUnits,
    aggregatePresent,
  } = input;

  const complete = perUnit && missingUnits.length === 0;
  const noData = !perUnit && !aggregatePresent;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{measureName}</p>
          {variableNames.length > 0 && (
            <p className="text-muted-foreground font-mono text-[11px]">
              {variableNames.join(", ")}
            </p>
          )}
        </div>
        {perUnit ? (
          <Badge variant={complete ? "secondary" : "destructive"}>
            {enteredUnits.length}/{totalUnits} units entered
          </Badge>
        ) : (
          <Badge variant={aggregatePresent ? "secondary" : "destructive"}>
            {aggregatePresent ? "value entered" : "no value"}
          </Badge>
        )}
      </div>

      {!perUnit && (
        <p className="text-muted-foreground mt-2 text-xs">
          {noData
            ? "No data entered for this measure this period (no unit-level shells found)."
            : "Entered at utility/station level — not tracked per generator."}
        </p>
      )}

      {perUnit && missingUnits.length > 0 && (
        <UnitList
          label={`Missing (${missingUnits.length})`}
          tone="missing"
          units={missingUnits}
        />
      )}

      {perUnit && missingUnits.length === 0 && (
        <p className="mt-2 text-xs font-medium text-success dark:text-success">
          ✓ All {totalUnits} generators have this input entered.
        </p>
      )}

      {perUnit && enteredUnits.length > 0 && missingUnits.length > 0 && (
        <UnitList
          label={`Entered (${enteredUnits.length})`}
          tone="entered"
          units={enteredUnits}
        />
      )}
    </div>
  );
}

function UnitList({
  label,
  tone,
  units,
}: {
  label: string;
  tone: "missing" | "entered";
  units: { unitId: number; unitName: string; stationName: string | null }[];
}) {
  return (
    <div className="mt-2">
      <p
        className={cn(
          "mb-1 text-[11px] font-semibold uppercase tracking-wide",
          tone === "missing"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {units.map((u) => (
          <span
            key={u.unitId}
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-xs",
              tone === "missing"
                ? "border-destructive/40 bg-destructive/5 text-foreground"
                : "text-muted-foreground",
            )}
            title={u.stationName ? `${u.stationName} · ${u.unitName}` : u.unitName}
          >
            {u.unitName}
          </span>
        ))}
      </div>
    </div>
  );
}

export default InputCoverageModal;
