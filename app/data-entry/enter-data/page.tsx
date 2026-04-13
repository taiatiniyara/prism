import { FilterStatePanel } from "@/components/data-entry/filterStatePanel";

import DataEntryFiltersClient from "@/app/data-entry/enter-data/filters.client";
import GeneratorGroups from "@/app/data-entry/enter-data/generatorGroups";
import InputRows from "@/app/data-entry/enter-data/inputRows";
import ProgressBreakdown from "@/app/data-entry/enter-data/progressBreakdown";
import TariffGroups from "@/app/data-entry/enter-data/tariffGroups";
import { getDataEntryFilterViewModel } from "@/app/data-entry/enter-data/service";

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
        <DataEntryFiltersClient
          context={model.context}
          options={model.options}
          showServiceAreaSelector={model.ui.showServiceAreaSelector}
        />
        <section
          className="flex justify-end"
          aria-label="Data entry progress"
        >
          <ProgressBreakdown progress={model.progress} />
        </section>
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
