import DataTable from "@/components/tables/data-table";
import { AddServiceArea, AllServiceAreas, UpdateServiceArea } from "./service";
import { ServiceArea } from "@/db/schema/utility";

export default async function ServiceAreasSettingsPage() {
  const serviceAreas = await AllServiceAreas();
  return (
    <DataTable<ServiceArea>
      data={serviceAreas}
      columns={[
        "name",
        "description",
        "provides_electricity",
        "provides_sanitation",
        "provides_water",
        "is_active",
        "is_virtual",
      ]}
      title="Service Areas"
      createFormProps={{
        formAction: AddServiceArea,
        fields: [
          {
            type: "text",
            key: "name",
          },
          {
            type: "textarea",
            key: "description",
          },
          {
            type: "boolean",
            key: "provides_electricity",
          },
          {
            type: "boolean",
            key: "provides_sanitation",
          },
          {
            type: "boolean",
            key: "provides_water",
          },
        ],
      }}
      updateFormProps={{
        formAction: UpdateServiceArea,
        fields: [
          {
            type: "text",
            key: "name",
          },
          {
            type: "textarea",
            key: "description",
          },
          {
            type: "boolean",
            key: "provides_electricity",
          },
          {
            type: "boolean",
            key: "provides_sanitation",
          },
          {
            type: "boolean",
            key: "provides_water",
          },
        ],
      }}
    />
  );
}
