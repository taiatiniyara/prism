import DataTable from "@/components/tables/data-table";
import { PowerStation } from "@/db/schema/utility";
import { getCurrentUser } from "@/lib/user.service";
import { AllServiceAreas } from "../service-areas/service";
import PowerStationDnD from "./powerStationDnD";
import {
  AddPowerStation,
  AllPowerStations,
  GetEnergyResourceList,
  UpdatePowerStation,
} from "./service";

export default async function PowerStationsSettingsPage() {
  const user = await getCurrentUser();

  const [powerStations, serviceAreas, energyResources] = await Promise.all([
    AllPowerStations(),
    AllServiceAreas(),
    GetEnergyResourceList(),
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
    <div>
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

      <div className="mt-8 border-t pt-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-1">
          Assign Energy Resources
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Drag energy resources between power stations to assign them. Drag to
          &quot;Unassigned&quot; to remove.
        </p>
        <PowerStationDnD
          powerStations={powerStations.map((ps) => ({
            id: ps.id,
            name: ps.name,
          }))}
          energyResources={energyResources}
        />
      </div>
    </div>
  );
}
