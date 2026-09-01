"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DataEntryBreakdownFilterOptions,
  DataEntryBreakdownRow,
  DataEntryBreakdownResult,
  InputBreakdownRow,
  getDataEntryBreakdown,
  getInputBreakdown,
} from "./service";

function BreakdownTooltip({
  active,
  payload,
  label,
}: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border bg-white p-2 text-xs shadow">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex justify-between gap-3">
          <span style={{ color: entry.color }}>{entry.name}:</span>
          <span className="font-mono font-semibold">
            {entry.value != null ? Number(entry.value).toLocaleString() : "0"}
          </span>
        </div>
      ))}
      <div className="mt-1 border-t pt-1 text-muted-foreground">
        Expected total:{" "}
        <span className="font-mono font-semibold">
          {Number(
            Number(payload.find((p) => p.dataKey === "v2")?.value ?? 0) +
              Number(payload.find((p) => p.dataKey === "Gap")?.value ?? 0),
          ).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

type Props = {
  options: DataEntryBreakdownFilterOptions;
  initialUtility?: string;
  initialReportPeriod?: string;
  initialCategory?: string;
  initialSubcategory?: string;
};

export default function DataEntryBreakdownPanel({
  options,
  initialUtility,
  initialReportPeriod,
  initialCategory,
  initialSubcategory,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const utility = searchParams.get("utility") ?? initialUtility ?? "";
  const reportPeriod =
    searchParams.get("reportPeriod") ?? initialReportPeriod ?? "";
  const reportType = searchParams.get("reportType") ?? "";
  const year = searchParams.get("year") ?? "";
  const category = searchParams.get("category") ?? initialCategory ?? "";
  const subcategory =
    searchParams.get("subcategory") ?? initialSubcategory ?? "";

  const [rows, setRows] = useState<DataEntryBreakdownRow[] | null>(null);
  const [inputSummary, setInputSummary] = useState<DataEntryBreakdownResult["inputSummary"]>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState("");
  const [drillRows, setDrillRows] = useState<InputBreakdownRow[]>([]);
  const [drillTotalV2, setDrillTotalV2] = useState(0);
  const [drillLoading, setDrillLoading] = useState(false);

  const scopedReportPeriods = useMemo(() => {
    if (!utility) return options.reportPeriods;
    const utilityId = Number(utility);
    if (!Number.isFinite(utilityId)) return options.reportPeriods;
    return options.reportPeriods.filter((rp) => rp.utilityId === utilityId);
  }, [options.reportPeriods, utility]);

  const scopedSubcategories = useMemo(() => {
    if (!category) return options.subcategories;
    const categoryId = Number(category);
    if (!Number.isFinite(categoryId)) return options.subcategories;
    const allowedIds =
      options.subcategoryIdsByCategoryId[categoryId];
    if (!allowedIds || allowedIds.length === 0) return [];
    const allowedSet = new Set(allowedIds);
    return options.subcategories.filter((s) => allowedSet.has(s.id));
  }, [options.subcategories, options.subcategoryIdsByCategoryId, category]);

  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const fetchBreakdown = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const result: DataEntryBreakdownResult = await getDataEntryBreakdown(
        utility ? Number(utility) : null,
        reportPeriod ? Number(reportPeriod) : null,
        reportType ? Number(reportType) : null,
        year ? Number(year) : null,
        category ? Number(category) : null,
        subcategory ? Number(subcategory) : null,
      );
      setRows(result.rows);
      setInputSummary(result.inputSummary);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      setFetchError(message);
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [utility, reportPeriod, reportType, year, category, subcategory]);

  useEffect(() => {
    void (async () => {
      setRows(null);
      await fetchBreakdown();
    })();
  }, [fetchBreakdown]);

  const totalV1 = rows?.reduce((sum, r) => sum + r.v1Count, 0) ?? 0;
  const totalV2 = rows?.reduce((sum, r) => sum + r.v2Count, 0) ?? 0;
  const totalExpected = rows?.reduce((sum, r) => sum + r.expectedCount, 0) ?? 0;

  const categoryBreakdown = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, { v1: number; v2: number; expected: number }>();
    for (const r of rows) {
      const k = r.categoryName;
      const prev = map.get(k) ?? { v1: 0, v2: 0, expected: 0 };
      map.set(k, {
        v1: prev.v1 + r.v1Count,
        v2: prev.v2 + r.v2Count,
        expected: prev.expected + r.expectedCount,
      });
    }
    return Array.from(map.entries())
      .map(([name, counts]) => ({
        name,
        v1: counts.v1,
        v2: counts.v2,
        expected: counts.expected,
        gap: Math.max(0, counts.expected - counts.v2),
      }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  }, [rows]);

  const subcategoryBreakdown = useMemo(() => {
    if (!rows) return [];
    const map = new Map<
      string,
      { category: string; subcategory: string; v1: number; v2: number; expected: number }
    >();
    for (const r of rows) {
      const k = `${r.categoryName}||${r.subcategoryName}`;
      const prev = map.get(k) ?? {
        category: r.categoryName,
        subcategory: r.subcategoryName,
        v1: 0,
        v2: 0,
        expected: 0,
      };
      map.set(k, {
        category: r.categoryName,
        subcategory: r.subcategoryName,
        v1: prev.v1 + r.v1Count,
        v2: prev.v2 + r.v2Count,
        expected: prev.expected + r.expectedCount,
      });
    }
    return Array.from(map.entries())
      .map(([, data]) => ({
        categoryName: data.category,
        subcategoryName: data.subcategory,
        v1: data.v1,
        v2: data.v2,
        expected: data.expected,
        gap: Math.max(0, data.expected - data.v2),
      }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  }, [rows]);

  const chartMaxHeight = 800;
  const categoryChartHeight = Math.min(
    chartMaxHeight,
    Math.max(400, categoryBreakdown.length * 64),
  );
  const subcategoryChartHeight = Math.min(
    chartMaxHeight,
    Math.max(400, Math.round(subcategoryBreakdown.length * 83)),
  );

  const handleDrillDown = async (row: DataEntryBreakdownRow) => {
    setDrillTitle(`${row.categoryName} / ${row.subcategoryName} — ${row.utilityName}`);
    setDrillOpen(true);
    setDrillLoading(true);
    try {
      const result = await getInputBreakdown(
        row.utilityName === "All Utilities" ? 0 : row.utilityId,
        row.reportPeriodId,
        reportType ? Number(reportType) : null,
        year ? Number(year) : null,
        row.categoryId,
        row.subcategoryId,
        row.utilityName === "All Utilities" ? undefined : row.utilityName,
      );
      setDrillRows(result.rows);
      setDrillTotalV2(result.totalV2);
    } finally {
      setDrillLoading(false);
    }
  };

  return (
    <>
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Data Entry Breakdown</CardTitle>
        <CardDescription>
          Compare theoretical expected data entry counts vs actual counts
          grouped by utility, category, and sub-category.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-6">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Utility</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={utility}
              disabled={loading}
              onChange={(e) => {
                updateParams({
                  utility: e.target.value,
                  category: "",
                  subcategory: "",
                  reportPeriod: "",
                });
              }}
            >
              <option value="">All</option>
              {options.utilities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Report Type</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={reportType}
              disabled={loading}
              onChange={(e) => updateParams({ reportType: e.target.value })}
            >
              <option value="">All</option>
              {options.reportTypes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Year</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={year}
              disabled={loading}
              onChange={(e) => updateParams({ year: e.target.value })}
            >
              <option value="">All</option>
              {options.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Report Period</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={reportPeriod}
              disabled={loading}
              onChange={(e) => updateParams({ reportPeriod: e.target.value })}
            >
              <option value="">All</option>
              {scopedReportPeriods.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Measures Category</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={category}
              disabled={loading}
              onChange={(e) => {
                updateParams({
                  category: e.target.value,
                  subcategory: "",
                });
              }}
            >
              <option value="">All</option>
              {options.categories.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Measures Subcategory</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={subcategory}
              disabled={loading}
              onChange={(e) => updateParams({ subcategory: e.target.value })}
            >
              <option value="">All</option>
              {scopedSubcategories.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-72" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : fetchError ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Unable to load breakdown: {fetchError}
          </p>
        ) : !rows ? null : rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No data entries found for the selected filters.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-6 text-sm">
              <span>
                v1:{" "}
                <span className="font-semibold">
                  {totalV1.toLocaleString()}
                </span>
              </span>
              <span>
                v2:{" "}
                <span className="font-semibold">
                  {totalV2.toLocaleString()}
                </span>
              </span>
              <span>
                Expected:{" "}
                <span className="font-semibold">
                  {totalExpected.toLocaleString()}
                </span>
              </span>
              <span>
                Gap:{" "}
                <span
                  className={
                    totalExpected - totalV2 !== 0
                      ? "font-semibold text-red-600"
                      : "font-semibold"
                  }
                >
                  {(totalExpected - totalV2).toLocaleString()}
                </span>
              </span>
              <span>
                across {rows.length} row{rows.length !== 1 ? "s" : ""}
              </span>
            </div>

            {inputSummary ? (
              <div className="grid gap-1 rounded border bg-slate-50 p-3 text-xs">
                <div className="font-medium">Expected Breakdown</div>
                <div className="grid grid-cols-4 gap-x-4">
                  <span>
                    {inputSummary.totalInputs} inputs (Operational:{" "}
                    {inputSummary.operational}, Tariff:{" "}
                    {inputSummary.tariffStructure}, Generation:{" "}
                    {inputSummary.generation}, Other: {inputSummary.other})
                  </span>
                  <span>{inputSummary.reportPeriodCount} report periods</span>
                  <span>{inputSummary.saCount} SAs across utilities</span>
                  <span>{inputSummary.genCount} gens across utilities</span>
                </div>
                <div className="text-muted-foreground">
                  Distinct pairs: Operational/Tariff {inputSummary.saPairs.toLocaleString()}, Generation {inputSummary.genPairs.toLocaleString()}
                  {" "}| Other {inputSummary.other}×RPs×1 + Oper/Tariff {inputSummary.saPairs.toLocaleString()}×RPs + Gen {inputSummary.genPairs.toLocaleString()}×RPs
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    {inputSummary.utilities.length} utilities
                  </summary>
                  <div className="mt-1 grid grid-cols-4 gap-x-4 gap-y-0.5">
                    {inputSummary.utilities.map((u) => (
                      <span key={u.name}>
                        {u.name}: {u.reportPeriods} RP{u.reportPeriods !== 1 ? "s" : ""}, {u.sas} SA{u.sas !== 1 ? "s" : ""}, {u.gens} gen{u.gens !== 1 ? "s" : ""}
                      </span>
                    ))}
                  </div>
                </details>
              </div>
            ) : null}

            <div className="space-y-1">
              <h3 className="text-sm font-medium">By Category</h3>
              {categoryBreakdown.length === 0 ? (
                <p className="text-sm text-slate-500">No category data.</p>
              ) : (
                <div
                  className="rounded border bg-white"
                  style={{ height: categoryChartHeight }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryBreakdown.map((c) => ({
                        name: c.name,
                        v1: c.v1,
                        Expected: c.expected,
                        v2: c.v2,
                        Gap: c.gap,
                      }))}
                      layout="vertical"
                      margin={{
                        top: 8,
                        right: 20,
                        left: 10,
                        bottom: 8,
                      }}
                      onClick={(e: unknown) => {
                        const evt = e as { activeLabel?: string };
                        if (!evt?.activeLabel || !rows) return;
                        const match = rows.find(
                          (r) => r.categoryName === evt.activeLabel,
                        );
                        if (match) handleDrillDown(match);
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        width={140}
                      />
                      <Tooltip content={BreakdownTooltip} />
                      <Legend />
                      <Bar
                        dataKey="v1"
                        fill="#94a3b8"
                        radius={[0, 2, 2, 0]}
                      />
                      <Bar
                        dataKey="Expected"
                        fill="#a78bfa"
                        radius={[0, 2, 2, 0]}
                      />
                      <Bar
                        dataKey="v2"
                        stackId="theory"
                        fill="#22c55e"
                        radius={[0, 2, 2, 0]}
                      />
                      <Bar
                        dataKey="Gap"
                        stackId="theory"
                        fill="#ef4444"
                        radius={[0, 2, 2, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-medium">By Subcategory</h3>
              {subcategoryBreakdown.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No subcategory data.
                </p>
              ) : (
                <div
                  className="rounded border bg-white"
                  style={{ height: subcategoryChartHeight }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={subcategoryBreakdown.map((s) => ({
                        name: `${s.categoryName} / ${s.subcategoryName}`,
                        v1: s.v1,
                        Expected: s.expected,
                        v2: s.v2,
                        Gap: s.gap,
                      }))}
                      layout="vertical"
                      margin={{
                        top: 8,
                        right: 20,
                        left: 10,
                        bottom: 8,
                      }}
                      onClick={(e: unknown) => {
                        const evt = e as { activeLabel?: string };
                        if (!evt?.activeLabel || !rows) return;
                        const [cat, sub] = evt.activeLabel.split(" / ");
                        const match = rows.find(
                          (r) =>
                            r.categoryName === cat &&
                            r.subcategoryName === sub,
                        );
                        if (match) handleDrillDown(match);
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        width={200}
                      />
                      <Tooltip content={BreakdownTooltip} />
                      <Legend />
                      <Bar
                        dataKey="v1"
                        fill="#94a3b8"
                        radius={[0, 2, 2, 0]}
                      />
                      <Bar
                        dataKey="Expected"
                        fill="#a78bfa"
                        radius={[0, 2, 2, 0]}
                      />
                      <Bar
                        dataKey="v2"
                        stackId="theory"
                        fill="#22c55e"
                        radius={[0, 2, 2, 0]}
                      />
                      <Bar
                        dataKey="Gap"
                        stackId="theory"
                        fill="#ef4444"
                        radius={[0, 2, 2, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="max-h-105 overflow-auto rounded border">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    <th className="px-3 py-2">Utility</th>
                    <th className="px-3 py-2">Report Period</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Sub-Category</th>
                    <th className="px-3 py-2 text-right">v1</th>
                    <th className="px-3 py-2 text-right">v2</th>
                    <th className="px-3 py-2 text-right">
                      Expected
                    </th>
                    <th className="px-3 py-2 text-right">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={`${row.utilityName}-${row.categoryName}-${row.subcategoryName}-${index}`}
                      className="border-t hover:bg-slate-50 cursor-pointer"
                      onClick={() => handleDrillDown(row)}
                    >
                      <td className="px-3 py-2">
                        {row.utilityName}
                      </td>
                      <td>{row.reportPeriodLabel || "All"}</td>
                      <td className="px-3 py-2">{row.categoryName}</td>
                      <td className="px-3 py-2">
                        {row.subcategoryName}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.v1Count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.v2Count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.expectedCount.toLocaleString()}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${row.expectedCount !== row.v2Count ? "text-red-600" : ""}`}
                      >
                        {(
                          row.expectedCount - row.v2Count
                        ).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog open={drillOpen} onOpenChange={setDrillOpen}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{drillTitle}</DialogTitle>
        </DialogHeader>
        {drillLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {drillRows.length} inputs, {drillTotalV2.toLocaleString()} v2 entries
            </p>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="px-2 py-1.5 text-left">Input Name</th>
                  <th className="px-2 py-1.5 text-right w-20">v2</th>
                </tr>
              </thead>
              <tbody>
                {drillRows.filter((r) => r.v2Count > 0).length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-2 py-4 text-center text-muted-foreground">
                      No data entries for these inputs.
                    </td>
                  </tr>
                ) : (
                  drillRows
                    .filter((r) => r.v2Count > 0)
                    .sort((a, b) => b.v2Count - a.v2Count)
                    .map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1.5">{r.inputName}</td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {r.v2Count.toLocaleString()}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
