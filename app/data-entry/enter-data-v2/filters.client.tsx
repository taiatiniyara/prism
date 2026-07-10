"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  DataEntryStatusSelect,
  ReportPeriodSelect,
} from "@/components/data-entry/filterSelectors";
import {
  MeasureEntryFilterContext,
  MeasureEntryFilterOptions,
} from "./types";
import { updateFilterContextAction } from "./service";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DataEntrySelect } from "@/components/data-entry/dataEntrySelect";

interface MeasureEntryFiltersClientProps {
  context: MeasureEntryFilterContext;
  options: MeasureEntryFilterOptions;
}

const parseNullableInt = (value: string | null): number | null => {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export default function MeasureEntryFiltersClient({
  context,
  options,
}: MeasureEntryFiltersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlContext = useMemo<Partial<MeasureEntryFilterContext>>(
    () => ({
      reportPeriodId: parseNullableInt(searchParams.get("reportPeriodId")),
      measureCategoryId: parseNullableInt(
        searchParams.get("measureCategoryId"),
      ),
      measureSubcategoryId: parseNullableInt(
        searchParams.get("measureSubcategoryId"),
      ),
      dataEntryStatusId: parseNullableInt(
        searchParams.get("dataEntryStatusId"),
      ),
    }),
    [searchParams],
  );

  const mergedContext = useMemo<MeasureEntryFilterContext>(() => {
    const merged = { ...context };
    for (const key of [
      "reportPeriodId",
      "measureCategoryId",
      "measureSubcategoryId",
      "dataEntryStatusId",
    ] as const) {
      if (urlContext[key] !== undefined) {
        (merged as Record<string, number | null>)[key] = urlContext[key] ?? null;
      }
    }
    return merged;
  }, [context, urlContext]);

  const [localContext, setLocalContext] = useState(mergedContext);

  useEffect(() => {
    setLocalContext(mergedContext);
  }, [mergedContext]);

  const handleChange = (
    key: string,
    value: number | null,
    cascadeKeys?: string[],
  ) => {
    setLocalContext((prev) => {
      const next = { ...prev, [key]: value };
      if (cascadeKeys) {
        for (const ck of cascadeKeys) {
          (next as Record<string, number | null>)[ck] = null;
        }
      }
      return next;
    });

    startTransition(() => {
      void (async () => {
        try {
          await updateFilterContextAction(key, value);
          if (cascadeKeys) {
            for (const ck of cascadeKeys) {
              await updateFilterContextAction(ck, null);
            }
          }
          const nextParams = new URLSearchParams(searchParams.toString());
          if (value == null) {
            nextParams.delete(key);
          } else {
            nextParams.set(key, String(value));
          }
          if (cascadeKeys) {
            for (const ck of cascadeKeys) {
              nextParams.delete(ck);
            }
          }
          router.replace(
            `/data-entry/enter-data?${nextParams.toString()}`,
            { scroll: false },
          );
          router.refresh();
        } catch {
          toast.error("Failed to update filter. Please try again.");
        }
      })();
    });
  };

  return (
    <section className="flex flex-wrap gap-1.5 items-end">
      <ReportPeriodSelect
        value={localContext.reportPeriodId}
        options={options.reportPeriods}
        disabled={isPending}
        compact
        onChange={(value) =>
          handleChange("reportPeriodId", value)
        }
      />
      <DataEntrySelect
        value={
          localContext.measureCategoryId != null
            ? String(localContext.measureCategoryId)
            : undefined
        }
        disabled={isPending}
        size="compact"
        placeholder="Category"
        ariaLabel="Select measure category"
        searchable
        options={options.measureCategories.map((c) => ({
          value: String(c.id),
          label: c.name,
        }))}
        onValueChange={(value) =>
          handleChange("measureCategoryId", value ? Number(value) : null, [
            "measureSubcategoryId",
          ])
        }
        triggerClassName="w-40"
      />
      {localContext.measureCategoryId ? (
        <DataEntrySelect
          value={
            localContext.measureSubcategoryId != null
              ? String(localContext.measureSubcategoryId)
              : undefined
          }
          disabled={isPending}
          size="compact"
          placeholder="Subcategory"
          ariaLabel="Select measure subcategory"
          searchable
          options={options.measureSubcategories.map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
          onValueChange={(value) =>
            handleChange(
              "measureSubcategoryId",
              value ? Number(value) : null,
            )
          }
          triggerClassName="w-44"
        />
      ) : null}
      <DataEntryStatusSelect
        value={localContext.dataEntryStatusId}
        options={options.dataEntryStatuses}
        disabled={isPending}
        compact
        onChange={(value) => handleChange("dataEntryStatusId", value)}
      />
      {isPending ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground self-center" />
      ) : null}
    </section>
  );
}
