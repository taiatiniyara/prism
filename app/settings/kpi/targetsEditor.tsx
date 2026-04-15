"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import readXlsxFile from "read-excel-file/browser";
import * as XLSX from "xlsx";

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
import { KpiDefinition } from "@/db/schema/kpi";
import { toast } from "sonner";

import { SaveKpiTargets } from "./service";

type TargetRow = {
  id: string;
  year: string;
  month: string;
  targetValue: string;
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

const createEmptyRow = (): TargetRow => ({
  id: crypto.randomUUID(),
  year: String(new Date().getFullYear()),
  month: "fy",
  targetValue: "",
});

const parseTargetRows = (
  kpi: KpiDefinition | undefined,
  utilityId: number | null,
): TargetRow[] => {
  if (!kpi || utilityId == null) {
    return [createEmptyRow()];
  }

  const rows = (kpi.targets ?? [])
    .filter((item) => item.utility_id === utilityId)
    .filter((item) => Number.isInteger(item.year))
    .map((item) => ({
      id: crypto.randomUUID(),
      year: String(item.year),
      month: item.month == null ? "fy" : String(item.month),
      targetValue: item.target_value ?? "",
    }));

  return rows.length > 0 ? rows : [createEmptyRow()];
};

export default function KpiTargetsEditor(props: {
  kpis: KpiDefinition[];
  utilityId: number | null;
  canEditTargets: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, startTransition] = useTransition();
  const [selectedKpiId, setSelectedKpiId] = useState<string>(
    props.kpis[0]?.id ? String(props.kpis[0].id) : "",
  );

  const selectedKpi = useMemo(
    () => props.kpis.find((kpi) => String(kpi.id) === selectedKpiId),
    [props.kpis, selectedKpiId],
  );

  const [rows, setRows] = useState<TargetRow[]>(
    parseTargetRows(selectedKpi, props.utilityId),
  );

  const onKpiChange = (nextKpiId: string) => {
    setSelectedKpiId(nextKpiId);
    const nextKpi = props.kpis.find((kpi) => String(kpi.id) === nextKpiId);
    setRows(parseTargetRows(nextKpi, props.utilityId));
  };

  const updateRow = (id: string, patch: Partial<TargetRow>) => {
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
    if (!props.canEditTargets) {
      toast.error("Only utility users can edit KPI targets.");
      return;
    }

    if (!selectedKpiId) {
      toast.error("Please select a KPI.");
      return;
    }

    const keyed = new Map<
      string,
      { year: number; month: number | null; target_value: string }
    >();

    for (const row of rows) {
      const year = Number(row.year);
      if (!Number.isInteger(year) || year < 1900 || year > 3000) {
        continue;
      }

      const month = row.month === "fy" ? null : Number(row.month);
      if (
        month != null &&
        (!Number.isInteger(month) || month < 1 || month > 12)
      ) {
        continue;
      }

      const targetValue = row.targetValue.trim();
      if (!targetValue) {
        continue;
      }

      const key = `${year}-${month ?? "fy"}`;
      keyed.set(key, {
        year,
        month,
        target_value: targetValue,
      });
    }

    startTransition(async () => {
      const response = await SaveKpiTargets({
        kpiId: Number(selectedKpiId),
        targets: [...keyed.values()],
      });

      if (!response.success) {
        toast.error(response.message);
        return;
      }

      toast.success(response.message);
    });
  };

  const downloadTemplate = () => {
    if (!selectedKpi) {
      toast.error("Please select a KPI first.");
      return;
    }

    const templateRows = [
      ["kpi_id", "kpi_name", "year", "month", "target_value"],
      ...rows.map((row) => [
        selectedKpi.id,
        selectedKpi.name,
        row.year,
        row.month === "fy" ? "" : row.month,
        row.targetValue,
      ]),
    ];

    if (templateRows.length === 1) {
      templateRows.push([
        selectedKpi.id,
        selectedKpi.name,
        String(new Date().getFullYear()),
        "",
        "",
      ]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(templateRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "KPI Targets");

    const safeName = selectedKpi.name
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    XLSX.writeFile(
      workbook,
      `kpi-target-template-${safeName || selectedKpi.id}.xlsx`,
    );
  };

  const onUploadTargetsFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.item(0) ?? null;
    if (!file) {
      return;
    }

    if (!props.canEditTargets) {
      toast.error("Only utility users can edit KPI targets.");
      event.currentTarget.value = "";
      return;
    }

    if (!selectedKpi) {
      toast.error("Please select a KPI first.");
      event.currentTarget.value = "";
      return;
    }

    try {
      const rowsFromFile = await readXlsxFile(file, { sheet: "KPI Targets" });
      const headers = (rowsFromFile[0] ?? []).map((value) =>
        String(value ?? "")
          .trim()
          .toLowerCase(),
      );

      const indexOf = (name: string) => headers.indexOf(name);
      const kpiIdColumn = indexOf("kpi_id");
      const yearColumn = indexOf("year");
      const monthColumn = indexOf("month");
      const targetValueColumn = indexOf("target_value");

      if (yearColumn === -1 || targetValueColumn === -1) {
        toast.error("Template must include year and target_value columns.");
        return;
      }

      const parsed = rowsFromFile.slice(1).flatMap((row) => {
        const rowKpiId =
          kpiIdColumn === -1 ? selectedKpi.id : Number(row[kpiIdColumn]);
        if (rowKpiId !== selectedKpi.id) {
          return [];
        }

        const year = Number(row[yearColumn]);
        const rawMonth =
          monthColumn === -1 ? "" : String(row[monthColumn] ?? "").trim();
        const month = rawMonth === "" ? null : Number(rawMonth);
        const targetValue = String(row[targetValueColumn] ?? "").trim();

        if (
          !Number.isInteger(year) ||
          year < 1900 ||
          year > 3000 ||
          (month != null &&
            (!Number.isInteger(month) || month < 1 || month > 12)) ||
          targetValue.length === 0
        ) {
          return [];
        }

        return [
          {
            year,
            month,
            target_value: targetValue,
          },
        ];
      });

      if (parsed.length === 0) {
        toast.error("No valid target rows were found for the selected KPI.");
        return;
      }

      const keyed = new Map<string, (typeof parsed)[number]>();
      for (const target of parsed) {
        const key = `${target.year}-${target.month ?? "fy"}`;
        keyed.set(key, target);
      }

      const response = await SaveKpiTargets({
        kpiId: selectedKpi.id,
        targets: [...keyed.values()],
      });

      if (!response.success) {
        toast.error(response.message);
        return;
      }

      setRows(
        [...keyed.values()].map((target) => ({
          id: crypto.randomUUID(),
          year: String(target.year),
          month: target.month == null ? "fy" : String(target.month),
          targetValue: target.target_value,
        })),
      );

      toast.success(response.message);
    } catch {
      toast.error("Failed to read uploaded Excel file.");
    } finally {
      event.currentTarget.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI Targets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Set KPI target values by year and month (optional)
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={downloadTemplate}
            >
              Download Excel Template
            </Button>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              aria-label="Upload KPI targets Excel file"
              onChange={onUploadTargetsFile}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!props.canEditTargets || isSaving}
              className="w-full sm:w-auto"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Filled Template
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="kpi-target-kpi-select"
            className="text-sm font-medium"
          >
            KPI
          </label>
          <Select
            value={selectedKpiId}
            onValueChange={onKpiChange}
          >
            <SelectTrigger
              id="kpi-target-kpi-select"
              className="h-9 w-full"
            >
              <SelectValue placeholder="Select KPI" />
            </SelectTrigger>
            <SelectContent>
              {props.kpis.map((kpi) => (
                <SelectItem
                  key={kpi.id}
                  value={String(kpi.id)}
                >
                  {kpi.name} ({kpi.unit}) - {kpi.category} / {kpi.subcategory}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!props.canEditTargets ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Only utility users can edit KPI targets.
          </p>
        ) : null}

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="flex items-end gap-4"
            >
              <div className="space-y-1 lg:col-span-2">
                <label
                  htmlFor={`kpi-target-year-${row.id}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Year {index + 1}
                </label>
                <Input
                  id={`kpi-target-year-${row.id}`}
                  type="number"
                  placeholder="Year"
                  value={row.year}
                  disabled={!props.canEditTargets || isSaving}
                  onChange={(event) =>
                    updateRow(row.id, { year: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1 lg:col-span-4">
                <label
                  htmlFor={`kpi-target-month-${row.id}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Month {index + 1}
                </label>
                <Select
                  value={row.month}
                  onValueChange={(value) => updateRow(row.id, { month: value })}
                  disabled={!props.canEditTargets || isSaving}
                >
                  <SelectTrigger
                    id={`kpi-target-month-${row.id}`}
                    className="h-9 w-full shadow"
                  >
                    <SelectValue placeholder="Financial Year Only" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fy">Financial Year Only</SelectItem>
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
              </div>
              <div className="space-y-1 lg:col-span-4">
                <label
                  htmlFor={`kpi-target-value-${row.id}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Target Value {index + 1}
                </label>
                <Input
                  id={`kpi-target-value-${row.id}`}
                  type="text"
                  placeholder="Target value"
                  value={row.targetValue}
                  disabled={!props.canEditTargets || isSaving}
                  onChange={(event) =>
                    updateRow(row.id, { targetValue: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!props.canEditTargets || isSaving}
                className="w-full sm:w-auto lg:col-span-2"
                onClick={() => removeRow(row.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>

        <div className="flex justify-between flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="secondary"
            disabled={!props.canEditTargets || isSaving}
            className="w-full sm:w-auto"
            onClick={addRow}
          >
            Add Target Row
          </Button>
          <Button
            type="button"
            disabled={!props.canEditTargets || isSaving}
            className="w-full sm:w-auto"
            onClick={save}
          >
            {isSaving ? "Saving..." : "Save Targets"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
