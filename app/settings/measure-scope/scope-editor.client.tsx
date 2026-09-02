"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { MeasureScopeRow, saveMeasureDimensionScope } from "./service";
import { DIMENSIONS } from "@/components/formula-builder/types";
import { useState, useMemo } from "react";

interface MeasureDimensionScopeEditorProps {
  rows: MeasureScopeRow[];
  allDimensions: readonly string[];
}

// Standardised PRISM 2 dimension names, driven by the single source of truth
// (DIMENSIONS.scopeKey === measure_dimension_scope.dimension). Keeps the editor
// headers (Category / Technology / Asset Class / Consumption Band / …) in step
// with the formula builder instead of showing the raw codes (type/source/…).
const DIMENSION_LABELS: Record<string, string> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.scopeKey, d.label]),
);

export default function MeasureDimensionScopeEditor({
  rows,
  allDimensions,
}: MeasureDimensionScopeEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link target: /settings/measure-scope?measure=<id> (e.g. from the formula
  // builder's input card). Pre-filter to that measure and highlight its row.
  const focusId = Number(searchParams.get("measure")) || null;
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(
    () => rows.find((r) => r.measureId === focusId)?.measureName ?? "",
  );

  const filteredRows = useMemo(
    () =>
      search
        ? rows.filter(
            (r) =>
              r.measureName.toLowerCase().includes(search.toLowerCase()) ||
              r.measureVariableName
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
        : rows,
    [rows, search],
  );

  const handleToggle = (
    measureId: number,
    dimension: string,
    currentlyApplicable: boolean,
  ) => {
    startTransition(() => {
      void (async () => {
        try {
          await saveMeasureDimensionScope(
            measureId,
            dimension,
            !currentlyApplicable,
          );
          router.refresh();
          toast.success("Scope updated.");
        } catch {
          toast.error("Failed to update scope.");
        }
      })();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <Input
          placeholder="Search measures..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground sticky left-0 bg-muted/50 z-10 min-w-[240px]">
                Measure
              </th>
              {allDimensions.map((dim) => (
                <th
                  key={dim}
                  className="text-center px-2 py-2 font-medium text-muted-foreground w-[80px]"
                  title={dim}
                >
                  {DIMENSION_LABELS[dim] ?? dim}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr
                key={row.measureId}
                className={`border-b hover:bg-muted/30 transition-colors ${
                  row.measureId === focusId
                    ? "bg-amber-100/70 dark:bg-amber-900/30"
                    : i % 2 === 0
                      ? "bg-white"
                      : "bg-muted/10"
                }`}
              >
                <td className="px-3 py-2 sticky left-0 bg-inherit z-10">
                  <div className="font-medium truncate max-w-[240px]">
                    {row.measureName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.measureVariableName}
                  </div>
                </td>
                {allDimensions.map((dim) => {
                  const isApplicable = row.applicableDimensions.includes(
                    dim as never,
                  );
                  return (
                    <td key={dim} className="px-2 py-2 text-center">
                      <Checkbox
                        checked={isApplicable}
                        disabled={isPending}
                        onCheckedChange={() =>
                          handleToggle(row.measureId, dim, isApplicable)
                        }
                        className="size-4"
                        aria-label={`${row.measureName} - ${DIMENSION_LABELS[dim] ?? dim}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {filteredRows.length} of {rows.length} measures
        {isPending ? (
          <Loader2 className="size-3 inline ml-2 animate-spin" />
        ) : null}
      </div>
    </div>
  );
}
