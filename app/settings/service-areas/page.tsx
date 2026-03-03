import DataTable from "@/components/tables/data-table";
import { AddServiceArea, AllServiceAreas, UpdateServiceArea } from "./service";
import { ServiceArea } from "@/db/schema/utility";

export default async function ServiceAreasSettingsPage() {
  const serviceAreas = await AllServiceAreas({
    all: false,
  });
  return (
    <DataTable<ServiceArea>
      data={serviceAreas}
      columns={["name", "services_provided", "is_active"]}
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
