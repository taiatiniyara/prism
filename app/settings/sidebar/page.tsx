import { Suspense } from "react";
import DataTable from "@/components/tables/data-table";
import { SidebarAccess } from "@/db/schema/rls";
import {
  addSidebarAccess,
  getSidebarAccessList,
  reorderSidebarAccess,
  updateSidebarAccess,
} from "./service";

async function SidebarTable() {
  const data = await getSidebarAccessList();
  return (
    <DataTable<SidebarAccess>
      columns={["name", "page", "order", "roles"]}
      title="Sidebar Access"
      data={data}
      createFormProps={{
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "page",
            type: "text",
          },
          {
            key: "order",
            type: "number",
          },
          {
            key: "roles",
            type: "text",
          },
        ],
        buttonText: "Add Sidebar Access",
        formAction: addSidebarAccess,
      }}
      updateFormProps={{
        fields: [
          {
            key: "name",
            type: "text",
          },
          {
            key: "page",
            type: "text",
          },
          {
            key: "order",
            type: "number",
          },
          {
            key: "roles",
            type: "text",
          },
        ],
        formAction: updateSidebarAccess,
      }}
      reorderRowsProps={{
        orderKey: "order",
        formAction: reorderSidebarAccess,
      }}
    />
  );
}

export default function SidebarSettingsPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SidebarTable />
    </Suspense>
  );
}
