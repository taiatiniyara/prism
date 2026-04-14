import DevInputRelevanceTable from "./devInputRelevanceTable";
import {
  AddDevInputRelevance,
  GetDevInputRelevance,
  GetDevInputRelevanceOptions,
  UpdateDevInputRelevance,
} from "./service";

export default async function DevRelevanceSection() {
  const [inputRelevance, options] = await Promise.all([
    GetDevInputRelevance(),
    GetDevInputRelevanceOptions(),
  ]);

  return (
    <div className="space-y-5 rounded-lg border p-5 sm:p-6">
      <DevInputRelevanceTable
        items={inputRelevance}
        inputOptions={options.inputOptions}
        dimensionOptions={options.dimensionOptions}
        onAddItem={AddDevInputRelevance}
        onUpdateItem={UpdateDevInputRelevance}
      />
    </div>
  );
}
