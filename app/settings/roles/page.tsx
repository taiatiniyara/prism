import DataTable from "@/components/tables/data-table";
import { AllRoles, CreateRole, UpdateRole } from "./roles.service";
import { Role } from "@/db/schema/auth-schema";
import { getCurrentUser } from "@/lib/user.service";
import { redirect } from "next/navigation";

export default async function RolesSettingsPage() {
  const currentUser = await getCurrentUser();
  if (currentUser.role !== "BMO" && currentUser.role !== "DEV") {
    redirect("/settings");
  }
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
      updateFormProps={{
        formAction: UpdateRole,
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
