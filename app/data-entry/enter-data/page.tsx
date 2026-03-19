import { FilterStatePanel } from "@/components/data-entry/filterStatePanel";

import DataEntryFiltersClient from "@/app/data-entry/enter-data/filters.client";
import GeneratorGroups from "@/app/data-entry/enter-data/generatorGroups";
import InputRows from "@/app/data-entry/enter-data/inputRows";
import { getDataEntryFilterViewModel } from "@/app/data-entry/enter-data/service";

export default async function EnterDataPage() {
  const model = await getDataEntryFilterViewModel();
  const noFilterOptions =
    model.options.reportTypes.length === 0 ||
    model.options.inputCategories.length === 0;
  const { completedInputs, totalInputs } = model.progress;
  const progressPercentage =
    totalInputs > 0 ? Math.round((completedInputs / totalInputs) * 100) : 0;

  return (
    <div className="space-y-6">
      <FilterStatePanel
        isEmpty={noFilterOptions}
        emptyMessage="No data-entry filter options are available for your account."
      >
        <DataEntryFiltersClient
          context={model.context}
          options={model.options}
          showServiceAreaSelector={model.ui.showServiceAreaSelector}
        />
        <section
          className="flex justify-end"
          aria-label="Data entry progress"
        >
          <div className="w-full max-w-xs">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">Progress</span>
              <span className="text-muted-foreground">
                {progressPercentage}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-lime-400 transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {completedInputs}/{totalInputs} completed
            </p>
          </div>
        </section>
        {model.inputs.mode === "grouped-by-generator" ? (
          <GeneratorGroups groups={model.inputs.groups} />
        ) : (
          <InputRows rows={model.inputs.rows} />
        )}
      </FilterStatePanel>
    </div>
  );
}
