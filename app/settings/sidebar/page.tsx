import { Suspense } from "react";
import DataTable from "@/components/tables/data-table";
import { SidebarAccess } from "@/db/schema/rls";
import { getSidebarAccessList } from "./service";

async function SidebarTable() {
  const data = await getSidebarAccessList();
  return (
    <DataTable<SidebarAccess>
      columns={["name", "page", "order", "roles"]}
      title="Sidebar Access"
      data={data}
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
