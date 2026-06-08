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
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DataEntryBreakdownFilterOptions,
  DataEntryBreakdownRow,
  DataEntryBreakdownResult,
  getDataEntryBreakdown,
} from "./service";

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
  const category = searchParams.get("category") ?? initialCategory ?? "";
  const subcategory =
    searchParams.get("subcategory") ?? initialSubcategory ?? "";

  const [rows, setRows] = useState<DataEntryBreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [v1Error, setV1Error] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
    setV1Error(null);
    setFetchError(null);
    try {
      const result: DataEntryBreakdownResult = await getDataEntryBreakdown(
        utility ? Number(utility) : null,
        reportPeriod ? Number(reportPeriod) : null,
        category ? Number(category) : null,
        subcategory ? Number(subcategory) : null,
      );
      setRows(result.rows);
      setV1Error(result.v1Error);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      setFetchError(message);
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [utility, reportPeriod, category, subcategory]);

  useEffect(() => {
    setRows(null);
    fetchBreakdown();
  }, [fetchBreakdown]);

  const totalV1 = rows?.reduce((sum, r) => sum + r.v1Count, 0) ?? 0;
  const totalV2 = rows?.reduce((sum, r) => sum + r.v2Count, 0) ?? 0;

  const categoryBreakdown = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, { v1: number; v2: number }>();
    for (const r of rows) {
      const key = r.categoryName;
      const prev = map.get(key) ?? { v1: 0, v2: 0 };
      map.set(key, { v1: prev.v1 + r.v1Count, v2: prev.v2 + r.v2Count });
    }
    return Array.from(map.entries())
      .map(([name, counts]) => ({
        name,
        v1Count: counts.v1,
        v2Count: counts.v2,
        gap: counts.v1 - counts.v2,
      }))
      .sort((a, b) => b.gap - a.gap);
  }, [rows]);

  const subcategoryBreakdown = useMemo(() => {
    if (!rows) return [];
    const map = new Map<
      string,
      { category: string; subcategory: string; v1: number; v2: number }
    >();
    for (const r of rows) {
      const key = `${r.categoryName}||${r.subcategoryName}`;
      const prev = map.get(key) ?? {
        category: r.categoryName,
        subcategory: r.subcategoryName,
        v1: 0,
        v2: 0,
      };
      map.set(key, {
        category: r.categoryName,
        subcategory: r.subcategoryName,
        v1: prev.v1 + r.v1Count,
        v2: prev.v2 + r.v2Count,
      });
    }
    return Array.from(map.entries())
      .map(([, data]) => ({
        categoryName: data.category,
        subcategoryName: data.subcategory,
        v1Count: data.v1,
        v2Count: data.v2,
        gap: data.v1 - data.v2,
      }))
      .sort((a, b) => b.gap - a.gap);
  }, [rows]);

  const chartMaxHeight = 400;
  const categoryChartHeight = Math.min(
    chartMaxHeight,
    Math.max(200, categoryBreakdown.length * 32),
  );
  const subcategoryChartHeight = Math.min(
    chartMaxHeight,
    Math.max(200, subcategoryBreakdown.length * 32),
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Data Entry Breakdown</CardTitle>
        <CardDescription>
          Compare data entry counts between PRISM v1 and PRISM v2 grouped by
          utility, category, and sub-category.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
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
            <span className="font-medium">Input Category</span>
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
            <span className="font-medium">Input Subcategory</span>
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
        ) : !rows ? null : rows.length === 0 && !v1Error ? (
          <p className="text-sm text-slate-500">
            No data entries found for the selected filters.
          </p>
        ) : (
          <div className="space-y-2">
            {v1Error ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {v1Error}
              </p>
            ) : null}

            {rows.length > 0 ? (
              <>
                <div className="flex gap-6 text-sm">
                  <span>
                    PRISM v1 total:{" "}
                    <span className="font-semibold">{totalV1}</span>
                  </span>
                  <span>
                    PRISM v2 total:{" "}
                    <span className="font-semibold">{totalV2}</span>
                  </span>
                  <span>
                    across {rows.length} row{rows.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-medium">By Category</h3>
                  {categoryBreakdown.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No category data.
                    </p>
                  ) : (
                    <div
                      className="rounded border bg-white"
                      style={{ height: categoryChartHeight }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={categoryBreakdown.map((c) => ({
                            name: c.name,
                            Expected: c.v1Count,
                            Actual: c.v2Count,
                          }))}
                          layout="vertical"
                          margin={{
                            top: 8,
                            right: 20,
                            left: 10,
                            bottom: 8,
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
                          <Tooltip
                            formatter={(value) =>
                              value != null
                                ? Number(value).toLocaleString()
                                : "0"
                            }
                          />
                          <Legend />
                          <Bar
                            dataKey="Expected"
                            fill="#94a3b8"
                            radius={[0, 2, 2, 0]}
                          />
                          <Bar
                            dataKey="Actual"
                            fill="#3b82f6"
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
                            Expected: s.v1Count,
                            Actual: s.v2Count,
                          }))}
                          layout="vertical"
                          margin={{
                            top: 8,
                            right: 20,
                            left: 10,
                            bottom: 8,
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
                          <Tooltip
                            formatter={(value) =>
                              value != null
                                ? Number(value).toLocaleString()
                                : "0"
                            }
                          />
                          <Legend />
                          <Bar
                            dataKey="Expected"
                            fill="#94a3b8"
                            radius={[0, 2, 2, 0]}
                          />
                          <Bar
                            dataKey="Actual"
                            fill="#3b82f6"
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
                        <th className="px-3 py-2 text-right">PRISM v1</th>
                        <th className="px-3 py-2 text-right">PRISM v2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr
                          key={`${row.utilityName}-${row.categoryName}-${row.subcategoryName}-${index}`}
                          className="border-t hover:bg-slate-50"
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
                            {row.v1Count}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {row.v2Count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
