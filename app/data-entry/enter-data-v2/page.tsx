import { getMeasureEntryFilterViewModel } from "./service";
import MeasureEntryFiltersClient from "./filters.client";
import DimensionPanel from "./dimension-panel";
import MeasureTable from "./measure-table";

export default async function EnterDataV2Page() {
  const model = await getMeasureEntryFilterViewModel();
  const noOptions =
    model.options.reportPeriods.length === 0 ||
    model.options.measureCategories.length === 0;

  if (noOptions) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        No data-entry filter options are available for your account.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-40 bg-background border shadow-md rounded-lg p-4 space-y-3">
        <MeasureEntryFiltersClient
          context={model.context}
          options={model.options}
        />
        <DimensionPanel
          context={model.context}
          dimensions={model.dimensions}
          applicableDimensions={model.applicableDimensions}
        />
      </div>

      <MeasureTable
        rows={model.rows}
        context={model.context}
        applicableDimensions={model.applicableDimensions}
      />
    </div>
  );
}
