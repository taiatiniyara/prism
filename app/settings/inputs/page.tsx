import DataTable from "@/components/tables/data-table";
import { MeasureDefinition } from "@/db/schema/dataEntry";
import InputFormulaBuilder from "./formulaBuilder";
import {
  CreateMeasureDefinition,
  GetAllMeasureDefinitions,
  GetInputFormulaBuilderData,
  UpdateMeasureDefinition,
} from "./service";
import UploadInputsFromExcel from "./uploadFromExcel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SectionContainer from "@/components/layout/section-container";
import InputDlMapBuilder from "./mapBuilder";
import { UnifiedFormulaBuilder } from "@/components/formula-builder/UnifiedFormulaBuilder";
import { getUnifiedFormulaBuilderData } from "@/app/settings/kpi/unified-formula-service";

type InputsTab =
  | "definitions"
  | "formula-builder"
  | "new-formula-builder"
  | "upload"
  | "map-builder";

function resolveDefaultTab(tab: string | undefined): InputsTab {
  if (
    tab === "formula-builder" ||
    tab === "new-formula-builder" ||
    tab === "upload" ||
    tab === "definitions" ||
    tab === "map-builder"
  ) {
    return tab;
  }
  return "definitions";
}

export default async function InputsSettingsPage(props: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const searchParams = await Promise.resolve(props.searchParams);
  const defaultTab = resolveDefaultTab(searchParams?.tab);
  const measureDefinitions = await GetAllMeasureDefinitions();
  const formulaBuilderData = await GetInputFormulaBuilderData();
  const unifiedMeasureData = await getUnifiedFormulaBuilderData("measure");

  return (
    <div className="mx-auto w-full max-w-350 space-y-6 pb-8 sm:space-y-8">
      <Tabs
        defaultValue={defaultTab}
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap justify-start gap-2 p-1">
          <TabsTrigger value="definitions">Definitions</TabsTrigger>
          <TabsTrigger value="formula-builder">Formula Builder</TabsTrigger>
          <TabsTrigger value="new-formula-builder">
            New Formula Builder
          </TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="map-builder">Map Builder</TabsTrigger>
        </TabsList>

        <TabsContent value="definitions">
          <SectionContainer>
            <DataTable<MeasureDefinition>
              columns={[
                "name",
                "sort_order",
                "data_type",
                "unit",
                "formula",
                "is_active",
              ]}
              title="Inputs"
              data={measureDefinitions}
              createFormProps={{
                formAction: CreateMeasureDefinition,
                fields: [
                  {
                    key: "name",
                    type: "text",
                  },
                  {
                    key: "sort_order",
                    type: "number",
                    required: false,
                  },
                  {
                    key: "alternative_names",
                    type: "alternative-names",
                    required: false,
                  },
                  {
                    key: "measures_group_id",
                    type: "managed-list",
                    managedListName: "Measures Group",
                  },
                  {
                    key: "measures_subgroup_id",
                    type: "managed-list",
                    managedListName: "Measures Subgroup",
                  },
                  {
                    key: "data_type_id",
                    type: "managed-list",
                    managedListName: "Data Type",
                  },
                  {
                    key: "unit_id",
                    type: "managed-list",
                    managedListName: "Units",
                  },
                ],
              }}
              updateFormProps={{
                formAction: UpdateMeasureDefinition,
                fields: [
                  {
                    key: "name",
                    type: "text",
                  },
                  {
                    key: "sort_order",
                    type: "number",
                    required: false,
                  },
                  {
                    key: "alternative_names",
                    type: "alternative-names",
                    required: false,
                  },
                  {
                    key: "measures_group_id",
                    type: "managed-list",
                    managedListName: "Measures Group",
                  },
                  {
                    key: "measures_subgroup_id",
                    type: "managed-list",
                    managedListName: "Measures Subgroup",
                  },
                  {
                    key: "data_type_id",
                    type: "managed-list",
                    managedListName: "Data Type",
                  },
                  {
                    key: "unit_id",
                    type: "managed-list",
                    managedListName: "Units",
                  },
                ],
              }}
            />
          </SectionContainer>
        </TabsContent>

        <TabsContent value="formula-builder">
          <SectionContainer>
            <p className="mb-4 text-sm text-muted-foreground">
              Choose an input definition, then build its formula using other
              input definitions.
            </p>
            <InputFormulaBuilder
              inputs={formulaBuilderData.inputs}
              energyProviderOptions={formulaBuilderData.energyProviderOptions}
              energyTypeOptions={formulaBuilderData.energyTypeOptions}
              energySourceOptions={formulaBuilderData.energySourceOptions}
              previewContextLabel={formulaBuilderData.previewContextLabel}
            />
          </SectionContainer>
        </TabsContent>

        <TabsContent value="new-formula-builder">
          <SectionContainer>
            <p className="mb-4 text-sm text-muted-foreground">
              Build calculated-measure formulas with full 10-dimension
              bindings. Saved to the durable formula-binding store; use
              “Compute calculated measures” to calculate into data entries.
            </p>
            <UnifiedFormulaBuilder
              data={unifiedMeasureData}
              mode="measure"
            />
          </SectionContainer>
        </TabsContent>

        <TabsContent value="upload">
          <SectionContainer>
            <UploadInputsFromExcel />
          </SectionContainer>
        </TabsContent>

        <TabsContent value="map-builder">
          <InputDlMapBuilder />
        </TabsContent>
      </Tabs>
    </div>
  );
}
