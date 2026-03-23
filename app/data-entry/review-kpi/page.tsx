import { getReviewKpiPageViewModel } from "@/app/data-entry/review-kpi/service";
import { ReviewKpiShell } from "@/components/data-entry/review-kpi-shell";
import { ReviewKpiRowCard } from "@/components/data-entry/review-kpi-row";
import ReviewKpiFiltersClient from "@/app/data-entry/review-kpi/filters.client";

export default async function ReviewKpiPage() {
  const result = await getReviewKpiPageViewModel()
    .then((viewModel) => ({ viewModel, error: null as Error | null }))
    .catch((error) => ({ viewModel: null, error: error as Error }));

  if (result.error || result.viewModel == null) {
    return (
      <ReviewKpiShell
        error={
          result.error instanceof Error
            ? result.error.message
            : "Unable to load review KPI data."
        }
      >
        <div />
      </ReviewKpiShell>
    );
  }

  const { viewModel } = result;

  return (
    <ReviewKpiShell>
      <div className="space-y-2">
        <ReviewKpiFiltersClient
          context={viewModel.context}
          options={viewModel.options}
        />

        {viewModel.rows.length === 0 ? (
          <div className="rounded-md border bg-muted/20 p-2 text-xs sm:text-sm">
            No KPI rows are available for the selected filters.
          </div>
        ) : null}

        {viewModel.rows.map((row) => (
          <ReviewKpiRowCard
            key={row.kpiDefId}
            row={row}
            context={viewModel.context}
          />
        ))}
      </div>
    </ReviewKpiShell>
  );
}
