import DataTable from "@/components/tables/data-table";
import { InputDefinition } from "@/db/schema/dataEntry";
import InputFormulaBuilder from "./formulaBuilder";
import {
  CreateInputDefinition,
  GetAllInputDefinitions,
  GetInputFormulaBuilderData,
} from "./service";
import UploadInputsFromExcel from "./uploadFromExcel";

export default async function InputsSettingsPage() {
  const inputDefinitions = await GetAllInputDefinitions();
  const formulaBuilderData = await GetInputFormulaBuilderData();

  return (
    <div>
      <DataTable<InputDefinition>
        columns={["name", "data_type", "unit", "formula", "is_active"]}
        title="Inputs"
        data={inputDefinitions}
        createFormProps={{
          formAction: CreateInputDefinition,
          fields: [
            {
              key: "name",
              type: "text",
            },
            {
              key: "description",
              type: "text",
            },
            {
              key: "data_type",
              type: "select",
            },
            {
              key: "unit",
              type: "text",
            },
            {
              key: "is_active",
              type: "checkbox",
            },
          ],
        }}
      />

      <p className="text-muted-foreground mt-4 mb-2 text-sm">
        Choose an input definition, then build its formula using other input
        definitions.
      </p>
      <InputFormulaBuilder
        inputs={formulaBuilderData.inputs}
        energyProviderOptions={formulaBuilderData.energyProviderOptions}
        energyTypeOptions={formulaBuilderData.energyTypeOptions}
        energySourceOptions={formulaBuilderData.energySourceOptions}
        previewContextLabel={formulaBuilderData.previewContextLabel}
      />

      <UploadInputsFromExcel />
    </div>
  );
}
