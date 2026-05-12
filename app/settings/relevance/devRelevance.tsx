import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DevInputRelevanceTable from "./devInputRelevanceTable";
import DevOrganisationRelevancePivotTable from "./devOrganisationRelevancePivotTable";
import DevEnergyResourceTypeRelevanceBuilder from "./devEnergyResourceTypeRelevanceBuilder";
import {
  AddDevInputRelevance,
  GetDevOrganisationRelevancePivot,
  GetDevEnergyResourceTypeRelevance,
  GetDevInputRelevance,
  GetDevInputRelevanceOptions,
  UpdateDevInputRelevance,
} from "./service";

export default async function DevRelevanceSection(props: { isDevUser: boolean }) {
  const [inputRelevance, options, organisationRelevancePivot, relevanceItems] =
    await Promise.all([
      GetDevInputRelevance(),
      GetDevInputRelevanceOptions(),
      GetDevOrganisationRelevancePivot(),
      props.isDevUser ? GetDevEnergyResourceTypeRelevance() : Promise.resolve([]),
    ]);

  return (
    <div className="space-y-5">
      <Tabs defaultValue="input-relevance">
        <TabsList>
          <TabsTrigger value="input-relevance">Input Relevance</TabsTrigger>
          <TabsTrigger value="organisation-relevance">
            Organisation Relevance Pivot
          </TabsTrigger>
          {props.isDevUser ? (
            <TabsTrigger value="energy-resource-type-relevance-builder">
              Energy Resource Relevance Builder
            </TabsTrigger>
          ) : null}
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
        {props.isDevUser ? (
          <TabsContent value="energy-resource-type-relevance-builder">
            <div className="space-y-5 rounded-lg border p-5 sm:p-6">
              <DevEnergyResourceTypeRelevanceBuilder items={relevanceItems} />
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
