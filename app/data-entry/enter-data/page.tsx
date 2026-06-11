import { FilterStatePanel } from "@/components/data-entry/filterStatePanel";

import DataEntryFiltersClient from "@/app/data-entry/enter-data/filters.client";
import GeneratorGroups from "@/app/data-entry/enter-data/generatorGroups";
import InputRows from "@/app/data-entry/enter-data/inputRows";
import ProgressBreakdown from "@/app/data-entry/enter-data/progressBreakdown";
import TariffGroups from "@/app/data-entry/enter-data/tariffGroups";
import { getDataEntryFilterViewModel } from "@/app/data-entry/enter-data/service";
import { getCurrentUser } from "@/lib/user.service";
import { getDevValidationBuilderConfigFromDb } from "@/app/data-entry/enter-data/services/validation-builder/store";
import EnterDataTemplatePanel from "./templatePanel";

export default async function EnterDataPage() {
  const [model, user] = await Promise.all([
    getDataEntryFilterViewModel(),
    getCurrentUser(),
  ]);
  const builderConfig =
    user.role === "DEV" ? await getDevValidationBuilderConfigFromDb() : null;
  const noFilterOptions =
    model.options.reportTypes.length === 0 ||
    model.options.inputCategories.length === 0;

  return (
    <div className="space-y-6">
      {model.kpiWorker.latestFailureReason ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>KPI Calculation Issue:</strong>{" "}
          {model.kpiWorker.latestFailureReason}
          {model.kpiWorker.latestFailureUpdatedAt ? (
            <span className="text-red-600 ml-2 text-xs">
              (last failed:{" "}
              {new Date(
                model.kpiWorker.latestFailureUpdatedAt,
              ).toLocaleString()}
              )
            </span>
          ) : null}
        </div>
      ) : null}
      <FilterStatePanel
        isEmpty={noFilterOptions}
        emptyMessage="No data-entry filter options are available for your account."
      >
        <div className="sticky top-0 z-40 bg-background border shadow-md rounded-lg p-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pt-2">
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
              builderConfig={builderConfig}
            />
          </div>
        </div>
        {model.inputs.mode === "grouped-by-generator" ? (
          <GeneratorGroups
            key="generator-groups"
            groups={model.inputs.groups}
            dataEntryStatusId={model.context.dataEntryStatusId}
          />
        ) : model.inputs.mode === "grouped-by-payment-mode" ? (
          <TariffGroups
            key="tariff-groups"
            groups={model.inputs.groups}
          />
        ) : (
          <InputRows
            key="flat-rows"
            rows={model.inputs.rows}
          />
        )}
      </FilterStatePanel>
    </div>
  );
}
