import DataTable from "@/components/tables/data-table";
import { InputDefinition } from "@/db/schema/dataEntry";
import { CreateInputDefinition, GetAllInputDefinitions } from "./service";

export default async function InputsSettingsPage() {
  return (
    <DataTable<InputDefinition>
      columns={["name", "description", "data_type", "unit", "is_active"]}
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
  );
}
