"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  compareDataEntries,
  DataEntryComparisonFilterOptions,
  DataEntryComparisonResult,
} from "./service";
import { useTerm } from "@/lib/terminology/useTerm";

type Props = {
  options: DataEntryComparisonFilterOptions;
};

const statusLabel: Record<string, string> = {
  migrated: "Migrated",
  "missing-in-prism": "Missing in PRISM",
  "extra-in-prism": "Extra in PRISM",
};

export default function DataEntryComparisonPanel({ options }: Props) {
  const [utilityId, setUtilityId] = useState<string>("");
  const [reportPeriodId, setReportPeriodId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [subcategoryId, setSubcategoryId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DataEntryComparisonResult | null>(null);

  const scopedReportPeriods = useMemo(() => {
    if (!utilityId) return options.reportPeriods;
    const utility = Number(utilityId);
    if (!Number.isFinite(utility)) return options.reportPeriods;
    return options.reportPeriods.filter((rp) => rp.utilityId === utility);
  }, [options.reportPeriods, utilityId]);

  const serviceAreaTerm = useTerm("service_area");

  const runComparison = () => {
    startTransition(async () => {
      const response = await compareDataEntries({
        utilityId: utilityId ? Number(utilityId) : undefined,
        reportPeriodId: reportPeriodId ? Number(reportPeriodId) : undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        subcategoryId: subcategoryId ? Number(subcategoryId) : undefined,
      });

      setResult(response);
      toast.success("Data entry comparison completed.");
    });
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Data Entry Migration Comparison</CardTitle>
        <CardDescription>
          Compare source data_entry_main from prism-training against PRISM
          data_entries using filters.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Utility</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={utilityId}
              disabled={isPending}
              onChange={(event) => {
                setUtilityId(event.target.value);
                setReportPeriodId("");
              }}
            >
              <option value="">All</option>
              {options.utilities.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                >
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Report Period</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={reportPeriodId}
              disabled={isPending}
              onChange={(event) => setReportPeriodId(event.target.value)}
            >
              <option value="">All</option>
              {scopedReportPeriods.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Measures Category</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={categoryId}
              disabled={isPending}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">All</option>
              {options.categories.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                >
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Measures Subcategory</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={subcategoryId}
              disabled={isPending}
              onChange={(event) => setSubcategoryId(event.target.value)}
            >
              <option value="">All</option>
              {options.subcategories.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                >
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={isPending}
              onClick={runComparison}
            >
              {isPending ? "Comparing..." : "Run Comparison"}
            </Button>
          </div>
        </div>

        {result ? (
          <div className="space-y-3">
            <div className="grid gap-2 text-sm md:grid-cols-7">
              <div className="rounded border p-2">
                Source Keys: {result.summary.sourceCount}
              </div>
              <div className="rounded border p-2">
                PRISM Keys: {result.summary.prismCount}
              </div>
              <div className="rounded border p-2">
                Migrated: {result.summary.migratedCount}
              </div>
              <div className="rounded border p-2">
                Missing in PRISM: {result.summary.missingInPrismCount}
              </div>
              <div className="rounded border p-2">
                Extra in PRISM: {result.summary.extraInPrismCount}
              </div>
              <div className="rounded border p-2">
                Compared Rows: {result.summary.comparedRows}
              </div>
              <div className="rounded border p-2">
                {result.summary.sourceTruncated || result.summary.prismTruncated
                  ? `Truncated: source=${result.summary.sourceTruncated ? "yes" : "no"}, prism=${result.summary.prismTruncated ? "yes" : "no"}`
                  : "Full result"}
              </div>
            </div>

            <div className="max-h-105 overflow-auto rounded border">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Report Period</th>
                    <th className="px-2 py-2">Input</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2">Subcategory</th>
                    <th className="px-2 py-2">{serviceAreaTerm}</th>
                    <th className="px-2 py-2">Generator</th>
                    <th className="px-2 py-2">Provider</th>
                    <th className="px-2 py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 ? (
                    <tr>
                      <td
                        className="px-2 py-3 text-center text-slate-500"
                        colSpan={9}
                      >
                        No comparison rows for selected filters.
                      </td>
                    </tr>
                  ) : (
                    result.rows.map((row, index) => (
                      <tr
                        key={`${row.status}-${row.reportPeriodId}-${row.inputDefId}-${index}`}
                        className="border-t"
                      >
                        <td className="px-2 py-2">
                          {statusLabel[row.status] ?? row.status}
                        </td>
                        <td className="px-2 py-2">{row.reportPeriodLabel}</td>
                        <td className="px-2 py-2">{row.inputDefName}</td>
                        <td className="px-2 py-2">{row.categoryName}</td>
                        <td className="px-2 py-2">{row.subcategoryName}</td>
                        <td className="px-2 py-2">{row.serviceAreaName}</td>
                        <td className="px-2 py-2">{row.unitName}</td>
                        <td className="px-2 py-2">{row.energyProviderName}</td>
                        <td className="px-2 py-2">{row.energySourceName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
