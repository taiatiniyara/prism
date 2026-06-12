import ScorecardPageClient from "./page.client";
import type { ScorecardFilterContext } from "@/app/data-entry/balanced-scorecard/types";
import { bootstrapReviewKpiContextAndOptions } from "@/app/data-entry/review-kpi/service";
import { getScorecardKpiOptions } from "@/app/data-entry/balanced-scorecard/service";
import { listCustomKpiProposalReferenceOptions } from "@/app/settings/kpi/custom-kpi/service";
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
  // BSC display is period-agnostic; keep a fallback period only for write paths.
  reportPeriodId: fallbackReportPeriodId,
  reportTypeId: context.reportTypeId,
  serviceAreaId: context.serviceAreaId,
  kpiCategoryId: context.kpiCategoryId,
  kpiSubcategoryId:
    context.kpiCategoryId == null ? null : context.kpiSubcategoryId,
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
    const [kpiOptions, customKpiReferenceOptions] = await Promise.all([
      getScorecardKpiOptions(user, scorecardContext),
      listCustomKpiProposalReferenceOptions().catch(() => ({
        availableInputDefinitions: [],
        availableUnits: [],
        availableDataTypes: [],
      })),
    ]);

    return (
      <ScorecardPageClient
        initialContext={scorecardContext}
        filterOptions={options}
        kpiOptions={kpiOptions}
        customKpiReferenceOptions={customKpiReferenceOptions}
        scopedUtilityId={user.org_id ?? null}
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
