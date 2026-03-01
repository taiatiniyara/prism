import DataTable from "@/components/tables/data-table";
import { AddServiceArea, AllServiceAreas } from "./service";

export default async function ServiceAreasSettingsPage() {
  const serviceAreas = await AllServiceAreas();
  return (
    <DataTable
      data={serviceAreas}
      columns={["name"]}
      title="Service Areas"
      createFormProps={{
        formAction: AddServiceArea,
        fields: [
          {
            type: "text",
            key: "name",
          },
        ],
      }}
    />
  );
}
