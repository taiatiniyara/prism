"use client";

import { useState } from "react";

import DataTable from "@/components/tables/data-table";
import { ManagedList, ManagedListItem } from "@/db/schema/managedLists";

import {
  CreateManagedList,
  CreateManagedListItem,
  UpdateManagedList,
  UpdateManagedListItem,
} from "./service";

export default function ManagedListsEditor({
  lists,
  items,
}: {
  lists: ManagedList[];
  items: ManagedListItem[];
}) {
  const [selectedListId, setSelectedListId] = useState<number | null>(
    lists[0]?.id ?? null,
  );

  const selectedList = lists.find((l) => l.id === selectedListId) ?? null;
  // Only the selected list's items appear in the detail (bottom) pane.
  const childItems = items.filter((i) => i.list_id === selectedListId);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Master — the parent managed lists. Click a row to load its items below. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <DataTable<ManagedList>
          title="Managed Lists"
          columns={["name", "description", "is_active"]}
          data={lists}
          onRowClick={(row) => setSelectedListId(row.id as number)}
          selectedRowId={selectedListId}
          createFormProps={{
            formAction: CreateManagedList,
            fields: [
              { key: "name", type: "text" },
              { key: "description", type: "text" },
            ],
          }}
          updateFormProps={{
            formAction: UpdateManagedList,
            fields: [
              { key: "name", type: "text" },
              { key: "description", type: "text" },
              { key: "is_active", type: "boolean" },
            ],
          }}
        />
      </div>

      {/* Detail — items of the selected list. New items inherit the selected list. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <DataTable<ManagedListItem>
          title={
            selectedList
              ? `Items — ${selectedList.name}`
              : "Items (select a list above)"
          }
          columns={[
            "name",
            "description",
            "parent",
            { name: "energy_resource_type", display: "Asset Class" },
            "color",
            "is_active",
          ]}
          data={childItems}
          createFormProps={{
            // Inject the selected list so new items land in it (no list picker).
            formAction: (data) =>
              CreateManagedListItem({
                ...data,
                list_id: selectedListId,
              } as ManagedListItem),
            fields: [
              { key: "name", type: "text" },
              { key: "description", type: "text" },
              {
                key: "parent_id",
                type: "select",
                required: false,
                selectList: childItems.map((m) => ({
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
              { key: "color", type: "color" },
            ],
          }}
          updateFormProps={{
            formAction: UpdateManagedListItem,
            fields: [
              { key: "name", type: "text" },
              { key: "description", type: "text" },
              {
                key: "parent_id",
                type: "select",
                required: false,
                selectList: childItems.map((m) => ({
                  label: m.name,
                  value: m.id,
                })),
              },
              // Move an item to another list if needed.
              {
                key: "list_id",
                type: "select",
                selectList: lists.map((m) => ({ label: m.name, value: m.id })),
              },
              {
                key: "asset_class_id",
                type: "managed-list",
                managedListName: "Asset Class",
                label: "Asset Class",
                required: false,
              },
              { key: "color", type: "color" },
              { key: "is_active", type: "boolean" },
            ],
          }}
        />
      </div>
    </div>
  );
}
