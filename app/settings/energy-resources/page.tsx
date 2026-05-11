import DataTable from "@/components/tables/data-table";
import {
  CreateEnergyResourceFromPeriodRow,
  GetAllEnergyResources,
  EnergyResourcePeriodTableRow,
  UpdateEnergyResourceFromPeriodRow,
} from "./service";
import { AllPowerStations } from "../power-stations/service";
import { AllServiceAreas } from "../service-areas/service";

const ENERGY_SOURCE_MANAGED_LIST_ALIASES = [
  "Energy Source",
  "Storage Energy Source",
  "Energy Storage Source",
  "Generator Energy Source",
].join("|");

export default async function EnergyResourcesSettingsPage() {
  const [energyResources, powerStations, serviceAreas] = await Promise.all([
    GetAllEnergyResources(),
    AllPowerStations(),
    AllServiceAreas(),
  ]);

  return (
    <DataTable<EnergyResourcePeriodTableRow>
      quickFilters={[
        {
          column: "report_period_type",
          label: "Report Period Type",
          allLabel: "All Report Period Types",
        },
        {
          column: "report_period",
          label: "Report Period",
          allLabel: "All Report Periods",
        },
        {
          column: "service_area",
          label: "Service Area",
          allLabel: "All Service Areas",
        },
        {
          column: "power_station",
          label: "Power Station",
          allLabel: "All Power Stations",
        },
      ]}
      columns={[
        {
          name: "type",
          display: "Resource Type",
        },
        "name",
        "capacity",
        "energy_provider",
        "energy_source",
        "is_active",
      ]}
      title="Energy Resources"
      data={energyResources}
      createFormProps={{
        formAction: CreateEnergyResourceFromPeriodRow,
        fields: [
          {
            key: "type_id",
            type: "managed-list",
            managedListName: "Energy Resource Type",
          },
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
            managedListName: ENERGY_SOURCE_MANAGED_LIST_ALIASES,
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
            managedListName: ENERGY_SOURCE_MANAGED_LIST_ALIASES,
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
