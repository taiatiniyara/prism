"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  KpiCategorySelect,
  KpiSubcategorySelect,
  ReportPeriodSelect,
  ReportTypeSelect,
  ServiceAreaSelect,
} from "@/components/data-entry/filterSelectors";
import { updateReviewKpiFilterContextAction } from "@/app/data-entry/review-kpi/actions";
import {
  ReviewKpiFilterContext,
  ReviewKpiFilterOptions,
} from "@/app/data-entry/review-kpi/types";

const applyLocalFilterCascade = (
  current: ReviewKpiFilterContext,
  key: keyof ReviewKpiFilterContext,
  value: number | null,
): ReviewKpiFilterContext => {
  const next: ReviewKpiFilterContext = {
    ...current,
    [key]: value,
  };

  if (key === "reportTypeId") {
    next.reportPeriodId = null;
    next.kpiCategoryId = null;
    next.kpiSubcategoryId = null;
    next.serviceAreaId = null;
  }

  if (key === "reportPeriodId") {
    next.kpiCategoryId = null;
    next.kpiSubcategoryId = null;
    next.serviceAreaId = null;
  }

  if (key === "kpiCategoryId") {
    next.kpiSubcategoryId = null;
    next.serviceAreaId = null;
  }

  if (key === "kpiSubcategoryId") {
    next.serviceAreaId = null;
  }

  if (next.kpiCategoryId == null) {
    next.kpiSubcategoryId = null;
  }

  return next;
};

interface ReviewKpiFiltersClientProps {
  context: ReviewKpiFilterContext;
  options: ReviewKpiFilterOptions;
}

export default function ReviewKpiFiltersClient({
  context,
  options,
}: ReviewKpiFiltersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localContext, setLocalContext] = useState(context);

  useEffect(() => {
    setLocalContext(context);
  }, [context]);

  const handleFilterChange = (
    key: keyof ReviewKpiFilterContext,
    value: number | null,
  ) => {
    setError(null);

    const next = applyLocalFilterCascade(localContext, key, value);
    setLocalContext(next);

    startTransition(async () => {
      try {
        await updateReviewKpiFilterContextAction(key, value);
        router.refresh();
      } catch {
        setError("Unable to apply filters. Please try again.");
      }
    });
  };

  return (
    <section className="space-y-1.5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ReportTypeSelect
          value={localContext.reportTypeId}
          options={options.reportTypes}
          compact
          disabled={isPending}
          onChange={(value) => handleFilterChange("reportTypeId", value)}
        />
        <ReportPeriodSelect
          value={localContext.reportPeriodId}
          options={options.reportPeriods}
          compact
          disabled={isPending}
          onChange={(value) => handleFilterChange("reportPeriodId", value)}
        />
        <KpiCategorySelect
          value={localContext.kpiCategoryId}
          options={options.kpiCategories}
          compact
          disabled={isPending}
          onChange={(value) => handleFilterChange("kpiCategoryId", value)}
        />
        <KpiSubcategorySelect
          value={localContext.kpiSubcategoryId}
          options={options.kpiSubcategories}
          compact
          disabled={isPending || localContext.kpiCategoryId == null}
          onChange={(value) => handleFilterChange("kpiSubcategoryId", value)}
        />
        <ServiceAreaSelect
          value={localContext.serviceAreaId}
          options={options.serviceAreas}
          compact
          disabled={isPending}
          onChange={(value) => handleFilterChange("serviceAreaId", value)}
        />
      </div>

      {isPending ? (
        <p
          className="text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Applying filters...
        </p>
      ) : null}

      {error ? (
        <p
          className="text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
