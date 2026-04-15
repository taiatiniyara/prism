"use client";

import { useMemo } from "react";
import type { ScorecardFilterContext } from "@/app/data-entry/balanced-scorecard/types";
import {
  KpiCategorySelect,
  KpiSubcategorySelect,
} from "@/components/data-entry/filterSelectors";
import type { ReviewKpiFilterOptions } from "@/app/data-entry/review-kpi/types";

export default function ScorecardFiltersClient({
  context,
  options,
  onChange,
}: {
  context: ScorecardFilterContext;
  options: ReviewKpiFilterOptions;
  onChange: (context: ScorecardFilterContext) => void;
}) {
  const setField = (
    key: keyof ScorecardFilterContext,
    value: number | null,
  ) => {
    onChange({ ...context, [key]: value });
  };

  const visibleSubcategories = useMemo(() => {
    if (context.kpiCategoryId == null) {
      return [];
    }

    return options.kpiSubcategories.filter(
      (subcategory) => subcategory.parent_id === context.kpiCategoryId,
    );
  }, [context.kpiCategoryId, options.kpiSubcategories]);

  return (
    <div className="flex flex-wrap items-end gap-1.5">
      <KpiCategorySelect
        value={context.kpiCategoryId}
        compact
        options={options.kpiCategories}
        onChange={(value) =>
          onChange({
            ...context,
            kpiCategoryId: value,
            kpiSubcategoryId: null,
          })
        }
      />
      <KpiSubcategorySelect
        value={context.kpiSubcategoryId}
        compact
        options={visibleSubcategories}
        disabled={
          context.kpiCategoryId == null || visibleSubcategories.length === 0
        }
        onChange={(value) => setField("kpiSubcategoryId", value)}
      />
    </div>
  );
}
