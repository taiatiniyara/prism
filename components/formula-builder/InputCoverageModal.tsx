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
  type CoverageUnit,
  type InputCoverage,
  type PeriodInputCoverage,
} from "@/app/settings/kpi/input-coverage-service";

/** Format an entered value for display: thousands-separated number, else raw. */
const fmt = (v: string | null): string => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : v;
};

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
            data?.inputs.map((input, idx) => (
              <CoverageCard key={`${input.measureDefId}-${idx}`} input={input} />
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
    sliced,
    perUnit,
    totalUnits,
    enteredUnits,
    missingUnits,
    aggregatePresent,
    aggregateValue,
    optional,
  } = input;

  const complete = perUnit && missingUnits.length === 0;
  const noData = !perUnit && !aggregatePresent;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {measureName}
            {sliced && (
              <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
                · sliced
              </span>
            )}
            {optional && (
              <span className="ml-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                · optional
              </span>
            )}
          </p>
          {variableNames.length > 0 && (
            <p className="text-muted-foreground font-mono text-[11px]">
              {variableNames.join(", ")}
            </p>
          )}
        </div>
        {perUnit ? (
          <Badge
            variant="outline"
            className={cn(
              complete
                ? "border-success/40 bg-success/10 text-success"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {enteredUnits.length}/{totalUnits} units entered
          </Badge>
        ) : aggregatePresent ? (
          <Badge
            variant="outline"
            className="border-success/40 bg-success/10 font-mono text-success"
          >
            {fmt(aggregateValue)}
          </Badge>
        ) : optional ? (
          <Badge
            variant="outline"
            className="border-amber-400/50 bg-amber-400/10 font-mono text-amber-700 dark:text-amber-300"
          >
            0 · optional
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-destructive/40 bg-destructive/10 text-destructive"
          >
            missing
          </Badge>
        )}
      </div>

      {!perUnit && (
        <p className="text-muted-foreground mt-2 text-xs">
          {noData
            ? optional
              ? "No value entered — optional, so treated as 0 in the formula."
              : "No data entered for this measure this period (no unit-level shells found)."
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

      {perUnit && enteredUnits.length > 0 && (
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
  units: CoverageUnit[];
}) {
  return (
    <div className="mt-2">
      <p
        className={cn(
          "mb-1 text-[11px] font-semibold uppercase tracking-wide",
          tone === "missing" ? "text-destructive" : "text-success",
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
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-success/40 bg-success/10 text-success",
            )}
            title={u.stationName ? `${u.stationName} · ${u.unitName}` : u.unitName}
          >
            {u.unitName}
            {tone === "entered" && u.value != null && (
              <span className="ml-1 font-mono font-semibold">{fmt(u.value)}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export default InputCoverageModal;
