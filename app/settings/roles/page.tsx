import DataTable from "@/components/tables/data-table";
import { AllRoles, CreateRole } from "./roles.service";
import { Role } from "@/db/schema/auth-schema";

export default async function RolesSettingsPage() {
  const list = await AllRoles();
  return (
    <DataTable<Role>
      columns={["name", "description"]}
      data={list}
      title="Roles"
      createFormProps={{
        formAction: CreateRole,
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
    />
  );
}
