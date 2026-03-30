import ScorecardPageClient from "./page.client";
import type { ScorecardFilterContext } from "@/app/data-entry/balanced-scorecard/types";
import { bootstrapReviewKpiContextAndOptions } from "@/app/data-entry/review-kpi/service";
import { getScorecardKpiOptions } from "@/app/data-entry/balanced-scorecard/service";
import { getCurrentUser } from "@/lib/user.service";

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
  // BSC should always include all KPI categories/subcategories.
  kpiCategoryId: null,
  kpiSubcategoryId: null,
});

export default async function BalancedScorecardPage() {
  try {
    const user = await getCurrentUser();
    const { context, options } = await bootstrapReviewKpiContextAndOptions();
    const fallbackReportPeriodId = options.reportPeriods[0]?.id ?? 1;
    const scorecardContext = toScorecardContext(
      context,
      fallbackReportPeriodId,
    );
    const kpiOptions = await getScorecardKpiOptions(user, scorecardContext);

    return (
      <ScorecardPageClient
        initialContext={scorecardContext}
        kpiOptions={kpiOptions}
      />
    );
  } catch {
    return (
      <div className="space-y-3 p-2 sm:p-3">
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Unable to load scorecard data. Please try again later.
        </div>
      </div>
    );
  }
}
