"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DataEntryBreakdownFilterOptions,
  DataEntryBreakdownRow,
  getDataEntryBreakdown,
} from "./service";

type Props = {
  options: DataEntryBreakdownFilterOptions;
};

export default function DataEntryBreakdownPanel({ options }: Props) {
  const [utilityId, setUtilityId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [subcategoryId, setSubcategoryId] = useState<string>("");
  const [rows, setRows] = useState<DataEntryBreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBreakdown = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDataEntryBreakdown(
        utilityId ? Number(utilityId) : null,
        categoryId ? Number(categoryId) : null,
        subcategoryId ? Number(subcategoryId) : null,
      );
      setRows(result);
    } finally {
      setLoading(false);
    }
  }, [utilityId, categoryId, subcategoryId]);

  useEffect(() => {
    setRows(null);
    fetchBreakdown();
  }, [fetchBreakdown]);

  const totalV1 = rows?.reduce((sum, r) => sum + r.v1Count, 0) ?? 0;
  const totalV2 = rows?.reduce((sum, r) => sum + r.v2Count, 0) ?? 0;

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
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Utility</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={utilityId}
              disabled={loading}
              onChange={(event) => {
                setUtilityId(event.target.value);
                setCategoryId("");
                setSubcategoryId("");
              }}
            >
              <option value="">All</option>
              {options.utilities.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Input Category</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={categoryId}
              disabled={loading}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setSubcategoryId("");
              }}
            >
              <option value="">All</option>
              {options.categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Input Subcategory</span>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-2"
              value={subcategoryId}
              disabled={loading}
              onChange={(event) => setSubcategoryId(event.target.value)}
            >
              <option value="">All</option>
              {options.subcategories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : !rows ? null : rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No data entries found for the selected filters.
          </p>
        ) : (
          <div className="space-y-2">
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
            <div className="max-h-105 overflow-auto rounded border">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    <th className="px-3 py-2">Utility</th>
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
                      <td className="px-3 py-2">{row.utilityName}</td>
                      <td className="px-3 py-2">{row.categoryName}</td>
                      <td className="px-3 py-2">{row.subcategoryName}</td>
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
