import DataTable from "@/components/tables/data-table";
import { PowerStation } from "@/db/schema/utility";
import { getCurrentUser } from "@/lib/user.service";
import { AllServiceAreas } from "../service-areas/service";
import {
  AddPowerStation,
  AllPowerStations,
  UpdatePowerStation,
} from "./service";

export default async function PowerStationsSettingsPage() {
  const user = await getCurrentUser();

  const [powerStations, serviceAreas] = await Promise.all([
    AllPowerStations(),
    AllServiceAreas(),
  ]);

  const columns: (keyof PowerStation)[] =
    user.role === "DEV"
      ? [
          "name",
          "utility",
          "service_area",
          "commissioned_date",
          "decommissioned_date",
          "is_active",
        ]
      : [
          "name",
          "service_area",
          "commissioned_date",
          "decommissioned_date",
          "is_active",
        ];

  return (
    <DataTable<PowerStation>
      data={powerStations}
      columns={columns}
      title="Power Stations"
      createFormProps={{
        formAction: AddPowerStation,
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "commissioned_date",
            type: "date",
            required: false,
          },
          {
            key: "decommissioned_date",
            type: "date",
            required: false,
          },
          {
            key: "service_area_id",
            type: "select",
            selectList: serviceAreas.map((serviceArea) => ({
              value: serviceArea.id,
              label: serviceArea.name,
            })),
          },
        ],
      }}
      updateFormProps={{
        formAction: UpdatePowerStation,
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "commissioned_date",
            type: "date",
            required: false,
          },
          {
            key: "service_area_id",
            type: "select",
            selectList: serviceAreas.map((serviceArea) => ({
              value: serviceArea.id,
              label: serviceArea.name,
            })),
          },
        ],
      }}
    />
  );
}
