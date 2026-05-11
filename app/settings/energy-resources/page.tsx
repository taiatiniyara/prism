import DataTable from "@/components/tables/data-table";
import {
  CreateEnergyResourceFromPeriodRow,
  GetAllEnergyResources,
  EnergyResourcePeriodTableRow,
  UpdateEnergyResourceFromPeriodRow,
} from "./service";
import { AllPowerStations } from "../power-stations/service";
import { AllServiceAreas } from "../service-areas/service";

export default async function EnergyResourcesSettingsPage() {
  const [energyResources, powerStations, serviceAreas] = await Promise.all([
    GetAllEnergyResources(),
    AllPowerStations(),
    AllServiceAreas(),
  ]);

  return (
    <DataTable<EnergyResourcePeriodTableRow>
      columns={[
        "service_area",
        "power_station",
        "name",
        {
          name: "report_period",
          display: "Report period",
        },
        "capacity",
        "is_active",
        {
          name: "type",
          display: "Resource Type",
        },
        "energy_provider",
        "energy_source",
      ]}
      title="Energy Resources"
      data={energyResources}
      createFormProps={{
        formAction: CreateEnergyResourceFromPeriodRow,
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "power_station_id",
            type: "select",
            selectList: powerStations.map((powerStation) => ({
              value: powerStation.id,
              label: powerStation.name,
            })),
          },
          {
            key: "service_area_id",
            type: "select",
            selectList: serviceAreas.map((serviceArea) => ({
              value: serviceArea.id,
              label: serviceArea.name,
            })),
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
          {
            key: "type_id",
            type: "managed-list",
            managedListName: "Energy Resource Type",
          },
        ],
      }}
      updateFormProps={{
        formAction: UpdateEnergyResourceFromPeriodRow,
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "power_station_id",
            type: "select",
            selectList: powerStations.map((powerStation) => ({
              value: powerStation.id,
              label: powerStation.name,
            })),
          },
          {
            key: "service_area_id",
            type: "select",
            selectList: serviceAreas.map((serviceArea) => ({
              value: serviceArea.id,
              label: serviceArea.name,
            })),
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
          {
            key: "type_id",
            type: "managed-list",
            managedListName: "Energy Resource Type",
          },
        ],
      }}
    />
  );
}
