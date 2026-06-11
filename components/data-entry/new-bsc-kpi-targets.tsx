"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  fetchKpiTargets,
  saveKpiTargets,
} from "@/app/data-entry/balanced-scorecard/new-bsc/client";
import type { KpiTargetRow } from "@/app/data-entry/balanced-scorecard/new-bsc/types";

const MONTHS = [
  { value: "fy", label: "Financial Year" },
  { value: "1", label: "Jan" },
  { value: "2", label: "Feb" },
  { value: "3", label: "Mar" },
  { value: "4", label: "Apr" },
  { value: "5", label: "May" },
  { value: "6", label: "Jun" },
  { value: "7", label: "Jul" },
  { value: "8", label: "Aug" },
  { value: "9", label: "Sep" },
  { value: "10", label: "Oct" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dec" },
];

type EditableRow = {
  key: string;
  year: string;
  month: string;
  targetValue: string;
};

const genKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t-${Math.floor(performance.now())}`;

const toEditable = (rows: KpiTargetRow[]): EditableRow[] =>
  rows.map((row) => ({
    key: genKey(),
    year: String(row.year),
    month: row.month == null ? "fy" : String(row.month),
    targetValue: row.targetValue,
  }));

/**
 * Inline KPI target editor. Targets are shared per-(utility, KPI) and
 * write through to the same store used by Settings -> KPI, so editing here is
 * equivalent and propagates to every placement of this KPI.
 */
export default function NewBscKpiTargets({
  kpiDefinitionId,
  canBuild,
}: {
  kpiDefinitionId: number;
  canBuild: boolean;
}) {
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const targets = await fetchKpiTargets(kpiDefinitionId);
        if (active) setRows(toEditable(targets));
      } catch (err) {
        if (active)
          toast.error(
            err instanceof Error ? err.message : "Unable to load targets.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [kpiDefinitionId]);

  const updateRow = (key: string, patch: Partial<EditableRow>) =>
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        key: genKey(),
        year: String(new Date().getFullYear()),
        month: "fy",
        targetValue: "",
      },
    ]);

  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((row) => row.key !== key));

  const save = async () => {
    setSaving(true);
    try {
      await saveKpiTargets({
        kpiDefinitionId,
        targets: rows.map((row) => ({
          year: Number(row.year),
          month: row.month === "fy" ? null : Number(row.month),
          targetValue: row.targetValue,
        })),
      });
      toast.success("Targets saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-[11px] text-muted-foreground">Loading targets…</div>;
  }

  return (
    <div className="space-y-1.5 rounded border bg-muted/20 p-2">
      {rows.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">
          No targets set for this KPI yet.
        </div>
      ) : null}

      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-1.5">
          <Input
            type="number"
            className="h-7 w-20 text-xs"
            placeholder="Year"
            value={row.year}
            disabled={!canBuild || saving}
            onChange={(event) => updateRow(row.key, { year: event.target.value })}
          />
          <Select
            value={row.month}
            disabled={!canBuild || saving}
            onValueChange={(value) => updateRow(row.key, { month: value })}
          >
            <SelectTrigger className="h-7 w-28 bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-7 flex-1 text-xs"
            placeholder="Target value"
            value={row.targetValue}
            disabled={!canBuild || saving}
            onChange={(event) =>
              updateRow(row.key, { targetValue: event.target.value })
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!canBuild || saving}
            onClick={() => removeRow(row.key)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}

      {canBuild ? (
        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={saving}
            onClick={addRow}
          >
            <Plus className="mr-1 size-3" /> Target
          </Button>
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
  );
}
