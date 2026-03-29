import ScorecardPageClient from "./page.client";
import type {
  ScorecardFilterContext,
  ScorecardKpiOption,
} from "@/app/data-entry/balanced-scorecard/types";
import {
  bootstrapReviewKpiContextAndOptions,
  listReviewKpiRows,
} from "@/app/data-entry/review-kpi/service";

const toScorecardContext = (
  context: {
    reportTypeId: number | null;
    reportPeriodId: number | null;
    kpiCategoryId: number | null;
    kpiSubcategoryId: number | null;
    serviceAreaId: number | null;
  },
  fallbackReportPeriodId: number,
): ScorecardFilterContext => ({
  reportPeriodId: context.reportPeriodId ?? fallbackReportPeriodId,
  reportTypeId: context.reportTypeId,
  serviceAreaId: context.serviceAreaId,
  kpiCategoryId: context.kpiCategoryId,
  kpiSubcategoryId: context.kpiSubcategoryId,
});

export default async function BalancedScorecardPage() {
  try {
    const { context, options } = await bootstrapReviewKpiContextAndOptions();
    const fallbackReportPeriodId = options.reportPeriods[0]?.id ?? 1;
    const reviewRows = await listReviewKpiRows(context);
    const kpiOptions: ScorecardKpiOption[] = reviewRows.map((row) => ({
      kpiId: row.result.kpiId,
      kpiDefinitionId: row.kpiDefId,
      reportPeriodId: row.reportPeriodId,
      kpiName: row.kpiName,
    }));

    return (
      <ScorecardPageClient
        initialContext={toScorecardContext(context, fallbackReportPeriodId)}
        options={options}
        kpiOptions={kpiOptions}
      />
    );
  } catch {
    return (
      <div className="space-y-3 p-2 sm:p-3">
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Unable to load scorecard filters.
        </div>
      </div>
    );
  }
}
