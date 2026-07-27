import DataTable from "@/components/tables/data-table";
import { AddServiceArea, AllServiceAreas, UpdateServiceArea } from "./service";
import { ServiceArea } from "@/db/schema/utility";
import { getCurrentUser } from "@/lib/user.service";
import { resolveTerm } from "@/lib/terminology/resolver";
import { getActiveSector } from "@/lib/terminology/active-sector";

export default async function ServiceAreasSettingsPage() {
  const user = await getCurrentUser();
  const serviceAreas = await AllServiceAreas();
  const activeSector = await getActiveSector();
  const columns: (keyof ServiceArea)[] = [
    "name",
    "provides_electricity",
    "provides_sanitation",
    "provides_water",
    "is_active",
  ];

  if (user.role === "DEV") {
    columns.push("is_virtual");
  }

  return (
    <DataTable<ServiceArea>
      data={serviceAreas}
      columns={columns}
      title={resolveTerm("service_area", { sector: activeSector, plural: true })}
      createFormProps={{
        formAction: AddServiceArea,
        fields: [
          {
            type: "text",
            key: "name",
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
