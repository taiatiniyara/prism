import DataTable from "@/components/tables/data-table";
import { AddServiceArea, AllServiceAreas, UpdateServiceArea } from "./service";

export default async function ServiceAreasSettingsPage() {
  const serviceAreas = await AllServiceAreas({
    all: false,
  });
  return (
    <DataTable
      data={serviceAreas}
      columns={["name", "services_provided_id"]}
      title="Service Areas"
      createFormProps={{
        formAction: AddServiceArea,
        fields: [
          {
            type: "text",
            key: "name",
          },
          {
            key: "services_provided_id",
            type: "managed-list",
            managedListName: "Services Provided",
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
            key: "services_provided_id",
            type: "managed-list",
            managedListName: "Services Provided",
          },
        ],
      }}
    />
  );
}
