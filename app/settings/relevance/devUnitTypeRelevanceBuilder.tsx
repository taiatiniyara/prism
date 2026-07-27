import DataTable from "@/components/tables/data-table";
import {
  CreateDevUnitTypeRelevance,
  DevUnitTypeRelevanceItem,
  UpdateDevUnitTypeRelevance,
} from "./service";

const ENERGY_RESOURCE_TYPE_MANAGED_LIST_ALIASES = [
  "Asset Class",
  "Energy Resouce Type",
].join("|");

const ENERGY_SOURCE_MANAGED_LIST_ALIASES = [
  "Technology",
  "Storage Technology",
  "Energy Storage Source",
  "Generator Technology",
].join("|");

const ENERGY_TYPE_MANAGED_LIST_ALIASES = ["Category", "Energy Types"].join(
  "|",
);

export default function DevUnitTypeRelevanceBuilder(props: {
  items: DevUnitTypeRelevanceItem[];
}) {
  return (
    <DataTable<DevUnitTypeRelevanceItem>
      title="Asset Class Relevance Builder"
      columns={[
        {
          name: "unitType",
          display: "Asset Class",
        },
        {
          name: "energyType",
          display: "Category",
        },
        {
          name: "energySource",
          display: "Technology",
        },
      ]}
      data={props.items}
      createFormProps={{
        formAction: CreateDevUnitTypeRelevance,
        fields: [
          {
            key: "unitTypeId",
            type: "managed-list",
            managedListName: ENERGY_RESOURCE_TYPE_MANAGED_LIST_ALIASES,
            label: "Asset Class",
          },
          {
            key: "energyTypeId",
            type: "managed-list",
            managedListName: ENERGY_TYPE_MANAGED_LIST_ALIASES,
            label: "Category",
          },
          {
            key: "energySourceId",
            type: "managed-list",
            managedListName: ENERGY_SOURCE_MANAGED_LIST_ALIASES,
            label: "Technology",
          },
        ],
      }}
      updateFormProps={{
        formAction: UpdateDevUnitTypeRelevance,
        fields: [
          {
            key: "unitTypeId",
            type: "managed-list",
            managedListName: ENERGY_RESOURCE_TYPE_MANAGED_LIST_ALIASES,
            label: "Asset Class",
          },
          {
            key: "energyTypeId",
            type: "managed-list",
            managedListName: ENERGY_TYPE_MANAGED_LIST_ALIASES,
            label: "Category",
          },
          {
            key: "energySourceId",
            type: "managed-list",
            managedListName: ENERGY_SOURCE_MANAGED_LIST_ALIASES,
            label: "Technology",
          },
        ],
      }}
    />
  );
}
