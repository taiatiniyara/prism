"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchReportTypes,
  saveKpiTargets,
} from "@/app/data-entry/balanced-scorecard/new-bsc/client";
import type { ReportTypeOption } from "@/app/data-entry/balanced-scorecard/new-bsc/types";

type GeneratedPeriod = {
  label: string;
  year: number;
  month: number | null;
  targetValue: string;
};

// Derive period columns from a tracking frequency + start date + count.
// The frequency name (a Report Type value) drives the step size.
const buildPeriods = (
  frequencyName: string,
  startDate: string,
  count: number,
): GeneratedPeriod[] => {
  const name = frequencyName.toLowerCase();
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];

  const periods: GeneratedPeriod[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    let label: string;
    let year: number;
    let month: number | null;

    if (name.includes("quarter")) {
      d.setMonth(d.getMonth() + i * 3);
      const q = Math.floor(d.getMonth() / 3) + 1;
      label = `Q${q} ${d.getFullYear()}`;
      year = d.getFullYear();
      month = d.getMonth() + 1;
    } else if (name.includes("annual") || name.includes("year")) {
      d.setFullYear(d.getFullYear() + i);
      label = String(d.getFullYear());
      year = d.getFullYear();
      month = null;
    } else {
      // Default / monthly.
      d.setMonth(d.getMonth() + i);
      label = d.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
      year = d.getFullYear();
      month = d.getMonth() + 1;
    }

    periods.push({ label, year, month, targetValue: "" });
  }
  return periods;
};

/**
 * Inline KPI target setup. New journey:
 *   1. pick tracking frequency (Report Type values)
 *   2. pick a start date
 *   3. enter how many tracking periods (default 1)
 *   4. Generate Table -> a 2-row (Period / Target) grid to fill in.
 * Targets write through to the shared per-(utility, KPI) store.
 */
export default function NewBscKpiTargets({
  kpiDefinitionId,
  canBuild,
}: {
  kpiDefinitionId: number;
  canBuild: boolean;
}) {
  const [frequencies, setFrequencies] = useState<ReportTypeOption[]>([]);
  const [frequencyId, setFrequencyId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [trackingPeriods, setTrackingPeriods] = useState<string>("1");
  const [periods, setPeriods] = useState<GeneratedPeriod[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const options = await fetchReportTypes();
        if (active) setFrequencies(options);
      } catch (err) {
        if (active)
          toast.error(
            err instanceof Error ? err.message : "Unable to load frequencies.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const generate = () => {
    const freq = frequencies.find((f) => String(f.id) === frequencyId);
    if (!freq) {
      toast.error("Select a tracking frequency.");
      return;
    }
    if (!startDate) {
      toast.error("Select a start date.");
      return;
    }
    const count = Number(trackingPeriods);
    if (!Number.isInteger(count) || count < 1 || count > 120) {
      toast.error("Tracking periods must be between 1 and 120.");
      return;
    }
    setPeriods(buildPeriods(freq.name, startDate, count));
  };

  const updateTarget = (index: number, value: string) =>
    setPeriods((prev) =>
      prev
        ? prev.map((p, i) => (i === index ? { ...p, targetValue: value } : p))
        : prev,
    );

  const save = async () => {
    if (!periods) return;
    const freq = frequencies.find((f) => String(f.id) === frequencyId);
    setSaving(true);
    try {
      await saveKpiTargets({
        kpiDefinitionId,
        targets: periods
          .filter((p) => p.targetValue.trim().length > 0)
          .map((p) => ({
            year: p.year,
            month: p.month,
            targetValue: p.targetValue.trim(),
          })),
        // Full plan (incl. blank periods) so Preview can report completion.
        plan: {
          frequency: freq?.name ?? "",
          startDate,
          periods: periods.map((p) => ({
            label: p.label,
            year: p.year,
            month: p.month,
            value: p.targetValue.trim(),
          })),
        },
      });
      toast.success("Targets saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded border bg-muted/20 p-2">
      {/* Steps 1-3: frequency, start date, periods */}
      <div className="flex flex-wrap items-end gap-3 text-[11px]">
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Tracking frequency</span>
          <Select
            value={frequencyId}
            disabled={!canBuild}
            onValueChange={setFrequencyId}
          >
            <SelectTrigger className="h-7 w-40 bg-white text-xs">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              {frequencies.map((freq) => (
                <SelectItem key={freq.id} value={String(freq.id)}>
                  {freq.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Start date</span>
          <Input
            type="date"
            className="h-7 w-36 text-xs"
            value={startDate}
            disabled={!canBuild}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Tracking periods</span>
          <Input
            type="number"
            min={1}
            max={120}
            className="h-7 w-24 text-xs"
            value={trackingPeriods}
            disabled={!canBuild}
            onChange={(event) => setTrackingPeriods(event.target.value)}
          />
        </label>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={!canBuild}
          onClick={generate}
        >
          Generate Table
        </Button>
      </div>

      {/* Step 4: generated Period / Target table */}
      {periods && periods.length > 0 ? (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded border bg-white">
            <table className="text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-2 py-1 text-left font-medium">Period</th>
                  <th className="px-2 py-1 text-left font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p, i) => (
                  <tr key={`row-${i}`} className="border-b last:border-0">
                    <td className="px-2 py-1 whitespace-nowrap">{p.label}</td>
                    <td className="px-1 py-1">
                      <Input
                        className="h-7 w-32 text-xs"
                        placeholder="—"
                        value={p.targetValue}
                        disabled={!canBuild}
                        onChange={(event) =>
                          updateTarget(i, event.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canBuild ? (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                className="h-7 text-[11px]"
                disabled={saving}
                onClick={save}
              >
                {saving ? "Saving…" : "Save targets"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
