"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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

export default function DataEntryFiltersClient({
  context,
  options,
  showServiceAreaSelector,
}: DataEntryFiltersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localContext, setLocalContext] = useState(context);

  useEffect(() => {
    setLocalContext(context);
  }, [context]);

  const handleChange = (
    key: DataEntryFilterCookieKey,
    value: number | null,
  ) => {
    const contextKey = keyMap[key];
    setLocalContext((prev) => applyFilterCascade(prev, contextKey, value));

    startTransition(async () => {
      await updateFilterContextAction(contextKey, value);
      router.refresh();
    });
  };

  return (
    <section className="flex flex-wrap gap-3">
      <ReportTypeSelect
        value={localContext.reportTypeId}
        options={options.reportTypes}
        disabled={isPending}
        onChange={(value) => handleChange("reportTypeId", value)}
      />
      <ReportPeriodSelect
        value={localContext.reportPeriodId}
        options={options.reportPeriods}
        disabled={isPending}
        onChange={(value) => handleChange("reportPeriodId", value)}
      />
      <InputCategorySelect
        value={localContext.inputCategoryId}
        options={options.inputCategories}
        disabled={isPending}
        onChange={(value) => handleChange("inputCategoryId", value)}
      />
      <InputSubcategorySelect
        value={localContext.inputSubcategoryId}
        options={options.inputSubcategories}
        disabled={isPending}
        onChange={(value) => handleChange("inputSubcategoryId", value)}
      />
      {showServiceAreaSelector ? (
        <ServiceAreaSelect
          value={localContext.serviceAreaId}
          options={options.serviceAreas}
          disabled={isPending}
          onChange={(value) => handleChange("serviceAreaId", value)}
        />
      ) : null}
      <DataEntryStatusSelect
        value={localContext.dataEntryStatusId}
        options={options.dataEntryStatuses}
        disabled={isPending}
        onChange={(value) => handleChange("dataEntryStatusId", value)}
      />
    </section>
  );
}
