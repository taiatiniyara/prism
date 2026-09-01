import DataTable from "@/components/tables/data-table";
import {
  CreateManagedList,
  CreateManagedListItem,
  GetAllManagedListItems,
  GetAllManagedLists,
  UpdateManagedList,
  UpdateManagedListItem,
} from "./service";
import { ManagedList, ManagedListItem } from "@/db/schema/managedLists";

export default async function ManagedListSettingsPage() {
  const ml = await GetAllManagedLists();
  const mlItems = await GetAllManagedListItems();
  return (
    <div>
      <DataTable<ManagedList>
        title="Managed Lists"
        columns={["id", "name", "description", "is_active"]}
        data={ml}
        createFormProps={{
          formAction: CreateManagedList,
          fields: [
            {
              key: "name",
              type: "text",
            },
            {
              key: "description",
              type: "text",
            },
          ],
        }}
        updateFormProps={{
          formAction: UpdateManagedList,
          fields: [
            {
              key: "name",
              type: "text",
            },
            {
              key: "description",
              type: "text",
            },
            {
              key: "is_active",
              type: "boolean",
            },
          ],
        }}
      />
      <DataTable<ManagedListItem>
        title="Managed List Items"
        columns={[
          "id",
          "name",
          "description",
          "list",
          "parent",
          {
            name: "energy_resource_type",
            display: "Asset Class",
          },
          "color",
          "is_active",
        ]}
        data={mlItems}
        createFormProps={{
          formAction: CreateManagedListItem,
          fields: [
            {
              key: "name",
              type: "text",
            },
            {
              key: "description",
              type: "text",
            },
            {
              key: "list_id",
              type: "select",
              selectList: ml.map((m) => ({
                label: m.name,
                value: m.id,
              })),
            },
            {
              key: "parent_id",
              type: "select",
              selectList: mlItems.map((m) => ({
                label: m.name,
                value: m.id,
              })),
            },
            {
              key: "asset_class_id",
              type: "managed-list",
              managedListName: "Asset Class",
              label: "Asset Class",
              required: false,
            },
            {
              key: "color",
              type: "color",
            },
          ],
        }}
        updateFormProps={{
          formAction: UpdateManagedListItem,
          fields: [
            {
              key: "name",
              type: "text",
            },
            {
              key: "description",
              type: "text",
            },
            {
              key: "list_id",
              type: "select",
              selectList: ml.map((m) => ({
                label: m.name,
                value: m.id,
              })),
            },
            {
              key: "asset_class_id",
              type: "managed-list",
              managedListName: "Asset Class",
              label: "Asset Class",
              required: false,
            },
            {
              key: "color",
              type: "color",
            },
          ],
        }}
      />
    </div>
  );
}
