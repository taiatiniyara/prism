import { FilterStatePanel } from "@/components/data-entry/filterStatePanel";

import DataEntryFiltersClient from "@/app/data-entry/enter-data/filters.client";
import GeneratorGroups from "@/app/data-entry/enter-data/generatorGroups";
import InputRows from "@/app/data-entry/enter-data/inputRows";
import ProgressBreakdown from "@/app/data-entry/enter-data/progressBreakdown";
import TariffGroups from "@/app/data-entry/enter-data/tariffGroups";
import { getDataEntryFilterViewModel } from "@/app/data-entry/enter-data/service";
import EnterDataTemplatePanel from "./templatePanel";

export default async function EnterDataPage() {
  const model = await getDataEntryFilterViewModel();
  const noFilterOptions =
    model.options.reportTypes.length === 0 ||
    model.options.inputCategories.length === 0;

  return (
    <div className="space-y-6">
      <FilterStatePanel
        isEmpty={noFilterOptions}
        emptyMessage="No data-entry filter options are available for your account."
      >
        <div className="sticky top-0 z-40 bg-background border shadow-md rounded-lg p-3">
          <div className="flex gap-20 flex-wrap items-end pt-2">
            <DataEntryFiltersClient
              context={model.context}
              options={model.options}
              showServiceAreaSelector={model.ui.showServiceAreaSelector}
            />
            <ProgressBreakdown progress={model.progress} />

            <EnterDataTemplatePanel
              inputs={model.inputs}
              context={model.context}
              options={model.options}
            />
          </div>
        </div>
        {model.inputs.mode === "grouped-by-generator" ? (
          <GeneratorGroups groups={model.inputs.groups} />
        ) : model.inputs.mode === "grouped-by-payment-mode" ? (
          <TariffGroups groups={model.inputs.groups} />
        ) : (
          <InputRows rows={model.inputs.rows} />
        )}
      </FilterStatePanel>
    </div>
  );
}
