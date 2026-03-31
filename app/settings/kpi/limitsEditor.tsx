"use client";

import { useMemo, useState, useTransition } from "react";
import { KpiDefinition } from "@/db/schema/kpi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SaveKpiLimits } from "./service";
import { toast } from "sonner";

type LimitRow = {
  id: string;
  year: string;
  month: string;
  lower: string;
  upper: string;
};

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const createEmptyRow = (): LimitRow => ({
  id: crypto.randomUUID(),
  year: String(new Date().getFullYear()),
  month: "fy",
  lower: "",
  upper: "",
});

const parseLimitRows = (kpi: KpiDefinition | undefined): LimitRow[] => {
  if (!kpi || !Array.isArray(kpi.limits) || kpi.limits.length === 0) {
    return [createEmptyRow()];
  }

  const rows = kpi.limits
    .filter((item) => item && typeof item.year === "number")
    .map((item) => ({
      id: crypto.randomUUID(),
      year: String(item.year),
      month: item.month == null ? "fy" : String(item.month),
      lower:
        item.lower == null || Number.isNaN(Number(item.lower))
          ? ""
          : String(item.lower),
      upper:
        item.upper == null || Number.isNaN(Number(item.upper))
          ? ""
          : String(item.upper),
    }));

  return rows.length > 0 ? rows : [createEmptyRow()];
};

export default function KpiLimitsEditor(props: {
  kpis: KpiDefinition[];
  isDevRole: boolean;
}) {
  const [isSaving, startTransition] = useTransition();
  const [selectedKpiId, setSelectedKpiId] = useState<string>(
    props.kpis[0]?.id ? String(props.kpis[0].id) : "",
  );

  const selectedKpi = useMemo(
    () => props.kpis.find((kpi) => String(kpi.id) === selectedKpiId),
    [props.kpis, selectedKpiId],
  );

  const [rows, setRows] = useState<LimitRow[]>(parseLimitRows(selectedKpi));

  const onKpiChange = (nextKpiId: string) => {
    setSelectedKpiId(nextKpiId);
    const nextKpi = props.kpis.find((kpi) => String(kpi.id) === nextKpiId);
    setRows(parseLimitRows(nextKpi));
  };

  const updateRow = (id: string, patch: Partial<LimitRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow()]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      return next.length > 0 ? next : [createEmptyRow()];
    });
  };

  const save = () => {
    if (!props.isDevRole) {
      toast.error("Only DEV users can edit KPI limits.");
      return;
    }

    if (!selectedKpiId) {
      toast.error("Please select a KPI.");
      return;
    }

    const keyed = new Map<
      string,
      {
        year: number;
        month: number | null;
        lower: number | null;
        upper: number | null;
      }
    >();

    for (const row of rows) {
      const year = Number(row.year);
      if (!Number.isFinite(year)) {
        continue;
      }

      const month = row.month === "fy" ? null : Number(row.month);
      if (
        month != null &&
        (!Number.isFinite(month) || month < 1 || month > 12)
      ) {
        continue;
      }

      const lower = row.lower.trim() === "" ? null : Number(row.lower);
      const upper = row.upper.trim() === "" ? null : Number(row.upper);

      if (
        (lower != null && !Number.isFinite(lower)) ||
        (upper != null && !Number.isFinite(upper))
      ) {
        continue;
      }

      if (lower == null && upper == null) {
        continue;
      }

      const key = `${year}-${month ?? "fy"}`;
      keyed.set(key, { year, month, lower, upper });
    }

    const limits = [...keyed.values()];

    startTransition(async () => {
      const response = await SaveKpiLimits({
        kpiId: Number(selectedKpiId),
        limits,
      });

      if (!response.success) {
        toast.error(response.message);
        return;
      }

      toast.success(response.message);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI Limits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Select a KPI, then set upper/lower limits by year and optional month.
          Leave month blank to apply the limit to financial year report periods
          only.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">KPI</label>
            <Select
              value={selectedKpiId}
              onValueChange={onKpiChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select KPI" />
              </SelectTrigger>
              <SelectContent>
                {props.kpis.map((kpi) => (
                  <SelectItem
                    key={kpi.id}
                    value={String(kpi.id)}
                  >
                    {kpi.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!props.isDevRole ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Only DEV users can edit KPI limits.
          </p>
        ) : null}

        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-12"
            >
              <Input
                type="number"
                placeholder="Year"
                value={row.year}
                disabled={!props.isDevRole || isSaving}
                onChange={(event) =>
                  updateRow(row.id, { year: event.target.value })
                }
                className="lg:col-span-2"
              />
              <Select
                value={row.month}
                onValueChange={(value) => updateRow(row.id, { month: value })}
                disabled={!props.isDevRole || isSaving}
              >
                <SelectTrigger className="lg:col-span-4">
                  <SelectValue placeholder="Month (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fy">
                    Financial Year Only (blank month)
                  </SelectItem>
                  {MONTHS.map((month) => (
                    <SelectItem
                      key={month.value}
                      value={month.value}
                    >
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Lower limit"
                value={row.lower}
                disabled={!props.isDevRole || isSaving}
                className="lg:col-span-2"
                onChange={(event) =>
                  updateRow(row.id, { lower: event.target.value })
                }
              />
              <Input
                type="number"
                placeholder="Upper limit"
                value={row.upper}
                disabled={!props.isDevRole || isSaving}
                className="lg:col-span-2"
                onChange={(event) =>
                  updateRow(row.id, { upper: event.target.value })
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={!props.isDevRole || isSaving}
                className="w-full sm:w-auto lg:col-span-2"
                onClick={() => removeRow(row.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="secondary"
            disabled={!props.isDevRole || isSaving}
            className="w-full sm:w-auto"
            onClick={addRow}
          >
            Add Limit Row
          </Button>
          <Button
            type="button"
            disabled={!props.isDevRole || isSaving}
            className="w-full sm:w-auto"
            onClick={save}
          >
            {isSaving ? "Saving..." : "Save Limits"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
