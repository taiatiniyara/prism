import DataTable from "@/components/tables/data-table";
import {
  CreateDevEnergyResourceTypeRelevance,
  DevEnergyResourceTypeRelevanceItem,
  UpdateDevEnergyResourceTypeRelevance,
} from "./service";

const ENERGY_RESOURCE_TYPE_MANAGED_LIST_ALIASES = [
  "Energy Resource Type",
  "Energy Resouce Type",
].join("|");

const ENERGY_SOURCE_MANAGED_LIST_ALIASES = [
  "Energy Source",
  "Storage Energy Source",
  "Energy Storage Source",
  "Generator Energy Source",
].join("|");

const ENERGY_TYPE_MANAGED_LIST_ALIASES = ["Energy Type", "Energy Types"].join(
  "|",
);

export default function DevEnergyResourceTypeRelevanceBuilder(props: {
  items: DevEnergyResourceTypeRelevanceItem[];
}) {
  return (
    <DataTable<DevEnergyResourceTypeRelevanceItem>
      title="Energy Resource Type Relevance Builder"
      columns={[
        {
          name: "energyResourceType",
          display: "Energy Resource Type",
        },
        {
          name: "energyType",
          display: "Energy Type",
        },
        {
          name: "energySource",
          display: "Energy Source",
        },
      ]}
      data={props.items}
      createFormProps={{
        formAction: CreateDevEnergyResourceTypeRelevance,
        fields: [
          {
            key: "energyResourceTypeId",
            type: "managed-list",
            managedListName: ENERGY_RESOURCE_TYPE_MANAGED_LIST_ALIASES,
            label: "Energy Resource Type",
          },
          {
            key: "energyTypeId",
            type: "managed-list",
            managedListName: ENERGY_TYPE_MANAGED_LIST_ALIASES,
            label: "Energy Type",
          },
          {
            key: "energySourceId",
            type: "managed-list",
            managedListName: ENERGY_SOURCE_MANAGED_LIST_ALIASES,
            label: "Energy Source",
          },
        ],
      }}
      updateFormProps={{
        formAction: UpdateDevEnergyResourceTypeRelevance,
        fields: [
          {
            key: "energyResourceTypeId",
            type: "managed-list",
            managedListName: ENERGY_RESOURCE_TYPE_MANAGED_LIST_ALIASES,
            label: "Energy Resource Type",
          },
          {
            key: "energyTypeId",
            type: "managed-list",
            managedListName: ENERGY_TYPE_MANAGED_LIST_ALIASES,
            label: "Energy Type",
          },
          {
            key: "energySourceId",
            type: "managed-list",
            managedListName: ENERGY_SOURCE_MANAGED_LIST_ALIASES,
            label: "Energy Source",
          },
        ],
      }}
    />
  );
}
