"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  DataEntryStatusSelect,
  InputCategorySelect,
  InputSubcategorySelect,
  ReportPeriodSelect,
  ReportTypeSelect,
  ServiceAreaSelect,
} from "@/components/data-entry/filterSelectors";
import {
  DataEntryFilterContext,
  DataEntryFilterCookieKey,
} from "@/app/data-entry/constants";
import { applyFilterCascade } from "@/app/data-entry/filterContext.rules";
import { DataEntryFilterOptions } from "@/app/data-entry/types";
import { updateFilterContextAction } from "@/app/data-entry/enter-data/service";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface DataEntryFiltersClientProps {
  context: DataEntryFilterContext;
  options: DataEntryFilterOptions;
  showServiceAreaSelector: boolean;
}

const keyMap: Record<DataEntryFilterCookieKey, keyof DataEntryFilterContext> = {
  reportTypeId: "reportTypeId",
  reportPeriodId: "reportPeriodId",
  inputCategoryId: "inputCategoryId",
  inputSubcategoryId: "inputSubcategoryId",
  serviceAreaId: "serviceAreaId",
  dataEntryStatusId: "dataEntryStatusId",
};

const parseNullableInt = (value: string | null): number | null => {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export default function DataEntryFiltersClient({
  context,
  options,
  showServiceAreaSelector,
}: DataEntryFiltersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlContext = useMemo<Partial<DataEntryFilterContext>>(() => ({
    reportTypeId: parseNullableInt(searchParams.get("reportTypeId")),
    reportPeriodId: parseNullableInt(searchParams.get("reportPeriodId")),
    inputCategoryId: parseNullableInt(searchParams.get("inputCategoryId")),
    inputSubcategoryId: parseNullableInt(searchParams.get("inputSubcategoryId")),
    serviceAreaId: parseNullableInt(searchParams.get("serviceAreaId")),
    dataEntryStatusId: parseNullableInt(searchParams.get("dataEntryStatusId")),
  }), [searchParams]);

  const mergedContext = useMemo<DataEntryFilterContext>(() => {
    const merged = { ...context };
    for (const key of Object.keys(merged) as (keyof DataEntryFilterContext)[]) {
      if (urlContext[key] !== undefined) {
        (merged as Record<string, number | null>)[key] = urlContext[key];
      }
    }
    return merged;
  }, [context, urlContext]);

  const [localContext, setLocalContext] = useState(mergedContext);

  useEffect(() => {
    setLocalContext(mergedContext);
  }, [mergedContext]);

  const handleChange = (
    key: DataEntryFilterCookieKey,
    value: number | null,
  ) => {
    const contextKey = keyMap[key];
    setLocalContext((prev) => applyFilterCascade(prev, contextKey, value));

    startTransition(() => {
      void (async () => {
        try {
          await updateFilterContextAction(contextKey, value);
          const nextParams = new URLSearchParams(searchParams.toString());
          if (value == null) {
            nextParams.delete(String(key));
          } else {
            nextParams.set(String(key), String(value));
          }
          router.replace(`/data-entry/enter-data?${nextParams.toString()}`, {
            scroll: false,
          });
          router.refresh();
        } catch {
          toast.error("Failed to update filter. Please try again.");
        }
      })();
    });
  };

  return (
    <section className="flex flex-wrap gap-1.5 xl:flex-nowrap xl:items-end">
      <ReportTypeSelect
        value={localContext.reportTypeId}
        options={options.reportTypes}
        disabled={isPending}
        compact
        onChange={(value) => handleChange("reportTypeId", value)}
      />
      <ReportPeriodSelect
        value={localContext.reportPeriodId}
        options={options.reportPeriods}
        disabled={isPending}
        compact
        onChange={(value) => handleChange("reportPeriodId", value)}
      />
      <InputCategorySelect
        value={localContext.inputCategoryId}
        options={options.inputCategories}
        disabled={isPending}
        compact
        onChange={(value) => handleChange("inputCategoryId", value)}
      />
      <InputSubcategorySelect
        value={localContext.inputSubcategoryId}
        options={options.inputSubcategories}
        disabled={isPending}
        compact
        onChange={(value) => handleChange("inputSubcategoryId", value)}
      />
      {showServiceAreaSelector ? (
        <ServiceAreaSelect
          value={localContext.serviceAreaId}
          options={options.serviceAreas}
          disabled={isPending}
          compact
          onChange={(value) => handleChange("serviceAreaId", value)}
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
