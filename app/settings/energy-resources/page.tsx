import DataTable from "@/components/tables/data-table";
import {
  CreateUnitFromPeriodRow,
  GetAllUnits,
  UnitPeriodTableRow,
  UpdateUnitFromPeriodRow,
  GetAllReportPeriods,
} from "./service";
import { AllPowerStations } from "../power-stations/service";
import { AllServiceAreas } from "../service-areas/service";
import { resolveTerm } from "@/lib/terminology/resolver";
import { getActiveSector } from "@/lib/terminology/active-sector";

const ENERGY_SOURCE_MANAGED_LIST_ALIASES = [
  "Technology",
  "Storage Technology",
  "Energy Storage Source",
  "Generator Technology",
].join("|");

export default async function UnitsSettingsPage() {
  const [units, powerStations, serviceAreas, reportPeriods] =
    await Promise.all([
      GetAllUnits(),
      AllPowerStations(),
      AllServiceAreas(),
      GetAllReportPeriods(),
    ]);

  const activeSector = await getActiveSector();
  const serviceAreaLabel = resolveTerm("service_area", { sector: activeSector });
  const serviceAreaLabelPlural = resolveTerm("service_area", {
    sector: activeSector,
    plural: true,
  });

  return (
    <DataTable<UnitPeriodTableRow>
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
          label: serviceAreaLabel,
          allLabel: `All ${serviceAreaLabelPlural}`,
        },
        {
          column: "power_station",
          label: "Power Station",
          allLabel: "All Power Stations",
        },
      ]}
      columns={[
        {
          name: "asset",
          display: "Asset Class",
        },
        "name",
        {
          name: "capacity",
          display: "Capacity (MW)",
        },
        "provider",
        "technology",
        "is_active",
      ]}
      title="Units"
      data={units}
      createFormProps={{
        formAction: CreateUnitFromPeriodRow,
        fields: [
          {
            key: "name",
            type: "text",
            label: "Resource Name",
          },
          {
            key: "is_aggregated",
            type: "boolean",
            label: "Is Aggregated Resource",
          },
          {
            key: "resource_qty",
            type: "number",
            label: "Resource Quantity",
          },
          {
            key: "power_station_id",
            type: "select",
            label: "Power Station",
            selectList: powerStations.map((powerStation) => ({
              value: powerStation.id,
              label: powerStation.name,
            })),
          },
          {
            key: "service_area_id",
            type: "select",
            label: serviceAreaLabel,
            selectList: serviceAreas.map((serviceArea) => ({
              value: serviceArea.id,
              label: serviceArea.name,
            })),
          },
          {
            key: "provider_id",
            type: "managed-list",
            managedListName: "Provider",
          },
          {
            key: "technology_id",
            type: "managed-list",
            managedListName: ENERGY_SOURCE_MANAGED_LIST_ALIASES,
            label: "Technology",
          },
          {
            key: "report_period_id",
            type: "select",
            label: "Report Period",
            selectList: reportPeriods.map((period) => ({
              value: period.id,
              label: period.label,
            })),
          },
          {
            key: "capacity",
            type: "number",
            label: "Capacity (MW)",
          },
        ],
      }}
      updateFormProps={{
        formAction: UpdateUnitFromPeriodRow,
        fields: [
          {
            key: "name",
            type: "text",
            label: "Resource Name",
          },
          {
            key: "is_aggregated",
            type: "boolean",
            label: "Is Aggregated Resource",
          },
          {
            key: "resource_qty",
            type: "number",
            label: "Resource Quantity",
          },
          {
            key: "power_station_id",
            type: "select",
            label: "Power Station",
            selectList: powerStations.map((powerStation) => ({
              value: powerStation.id,
              label: powerStation.name,
            })),
          },
          {
            key: "service_area_id",
            type: "select",
            label: serviceAreaLabel,
            selectList: serviceAreas.map((serviceArea) => ({
              value: serviceArea.id,
              label: serviceArea.name,
            })),
          },
          {
            key: "provider_id",
            type: "managed-list",
            managedListName: "Provider",
          },
          {
            key: "technology_id",
            type: "managed-list",
            managedListName: ENERGY_SOURCE_MANAGED_LIST_ALIASES,
            label: "Technology",
          },
          {
            key: "report_period_id",
            type: "select",
            label: "Report Period",
            selectList: reportPeriods.map((period) => ({
              value: period.id,
              label: period.label,
            })),
          },
          {
            key: "capacity",
            type: "number",
            label: "Capacity (MW)",
          },
        ],
      }}
    />
  );
}
