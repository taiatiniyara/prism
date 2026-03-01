import DataTable from "@/components/tables/data-table";
import { CreateEnergyResource, GetAllEnergyResources } from "./service";
import { EnergyResource } from "@/db/schema/utility";

export default async function EnergyResourcesSettingsPage() {
  return (
    <DataTable<EnergyResource>
      columns={[
        "report_period",
        "name",
        "energy_provider",
        "energy_source",
        "capacity_mw",
        "is_active",
      ]}
      title="Energy Resources"
      data={await GetAllEnergyResources()}
      createFormProps={{
        formAction: CreateEnergyResource,
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "capacity_mw",
            type: "number",
          },
          {
            key: "energy_provider_id",
            type: "managed-list",
            managedListName: "Energy Provider",
          },
          {
            key: "energy_type_id",
            type: "managed-list",
            managedListName: "Energy Type",
          },
          {
            key: "energy_source_id",
            type: "managed-list",
            managedListName: "Energy Source",
          },
        ],
      }}
    />
  );
}
