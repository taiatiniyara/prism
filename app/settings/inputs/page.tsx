import DataTable from "@/components/tables/data-table";
import { InputDefinition } from "@/db/schema/dataEntry";
import { CreateInputDefinition, GetAllInputDefinitions } from "./service";
import UploadInputsFromExcel from "./uploadFromExcel";

export default async function InputsSettingsPage() {
  return (
    <div>
      <DataTable<InputDefinition>
        columns={[
          "name",
          "variable_name",
          "description",
          "data_type",
          "unit",
          "is_active",
        ]}
        title="Inputs"
        data={await GetAllInputDefinitions()}
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

      <UploadInputsFromExcel />
    </div>
  );
}
