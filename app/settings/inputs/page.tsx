import DataTable from "@/components/tables/data-table";
import { MeasureDefinition } from "@/db/schema/dataEntry";
import {
  CreateMeasureDefinition,
  GetAllMeasureDefinitions,
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
  | "upload"
  | "map-builder";

function resolveDefaultTab(tab: string | undefined): InputsTab {
  if (
    tab === "formula-builder" ||
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
            <p className="mb-4 text-sm font-bold">
              Build or re-build Calculated Measures or KPIs formulas
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
