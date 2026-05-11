import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DevInputRelevanceTable from "./devInputRelevanceTable";
import DevOrganisationRelevancePivotTable from "./devOrganisationRelevancePivotTable";
import {
  AddDevInputRelevance,
  GetDevOrganisationRelevancePivot,
  GetDevInputRelevance,
  GetDevInputRelevanceOptions,
  UpdateDevInputRelevance,
} from "./service";

export default async function DevRelevanceSection() {
  const [inputRelevance, options, organisationRelevancePivot] =
    await Promise.all([
      GetDevInputRelevance(),
      GetDevInputRelevanceOptions(),
      GetDevOrganisationRelevancePivot(),
    ]);

  return (
    <div className="space-y-5">
      <Tabs defaultValue="input-relevance">
        <TabsList>
          <TabsTrigger value="input-relevance">Input Relevance</TabsTrigger>
          <TabsTrigger value="organisation-relevance">
            Organisation Relevance Pivot
          </TabsTrigger>
        </TabsList>

        <TabsContent value="input-relevance">
          <div className="space-y-5 rounded-lg border p-5 sm:p-6">
            <DevInputRelevanceTable
              items={inputRelevance}
              inputOptions={options.inputOptions}
              dimensionOptions={options.dimensionOptions}
              onAddItem={AddDevInputRelevance}
              onUpdateItem={UpdateDevInputRelevance}
            />
          </div>
        </TabsContent>

        <TabsContent value="organisation-relevance">
          <div className="space-y-5 rounded-lg border p-5 sm:p-6">
            <DevOrganisationRelevancePivotTable
              organisations={organisationRelevancePivot.organisations}
              rows={organisationRelevancePivot.rows}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
